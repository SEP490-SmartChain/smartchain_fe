import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { warehouseCameraDistance, warehouseEntityBounds, visualEntityKey } from './warehouseView';

import type { Bin, Zone } from '../api/warehouseLayoutApi';
import type { VisualEntity, VisualPlan } from '../schemas/warehouseVisualLayoutSchema';

type SceneData = {
  plan: VisualPlan;
  zones: Zone[];
  bins: Bin[];
  selected: VisualEntity | null;
  editing: boolean;
  matches?: ReadonlySet<string>;
  selectionLabel?: string;
};
type EntityObject = THREE.Group & { userData: { entity: VisualEntity } };

/** Owns GPU resources and pointer picking only; React owns validated drafts and HTTP. */
export function createWarehouseScene(
  host: HTMLElement,
  label: string,
  callbacks: {
    select: (entity: VisualEntity) => void;
    move: (entity: VisualEntity, x: number, z: number) => void;
    unavailable: () => void;
  },
  chipClassName: string,
) {
  const tokens = getComputedStyle(host);
  const color = (name: string) => new THREE.Color(tokens.getPropertyValue(`--sc-${name}`).trim());
  const scene = new THREE.Scene();
  scene.background = color('bg-primary');
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  canvas.style.touchAction = 'none';
  host.append(canvas);
  const chip = document.createElement('div');
  chip.className = chipClassName;
  chip.setAttribute('aria-hidden', 'true');
  chip.hidden = true;
  host.append(chip);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.minDistance = 5;
  controls.maxDistance = 1600;
  const ambient = new THREE.HemisphereLight(color('bg-surface'), color('secondary-light'), 1.6);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(color('bg-surface'), 2);
  sun.position.set(25, 65, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, far: 250 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const root = new THREE.Group();
  scene.add(root);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let data: SceneData | null = null;
  let topView = false;
  let selectedObject: THREE.Object3D | null = null;
  const chipAnchor = new THREE.Vector3();
  const projectedAnchor = new THREE.Vector3();
  const reservedWidth = () =>
    parseFloat(getComputedStyle(host).getPropertyValue('--planner-hud-width')) || 0;
  const projection = () => {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.setViewOffset(width, height, reservedWidth() / 2, 0, width, height);
    camera.updateProjectionMatrix();
  };
  let disposed = false,
    frame = 0;
  let binObjects: EntityObject[] = [];
  let rackInstances: THREE.InstancedMesh | null = null;
  let bodyInstances: THREE.InstancedMesh | null = null;
  let drag: {
    entity: VisualEntity;
    object: EntityObject;
    offset: THREE.Vector3;
    origin: THREE.Vector3;
    downX: number;
    downY: number;
    pointerId: number;
  } | null = null;
  const render = () => {
    frame = 0;
    if (!disposed && host.clientWidth && host.clientHeight) {
      renderer.render(scene, camera);
      chip.hidden = true;
      if (selectedObject && data?.selectionLabel) {
        selectedObject.localToWorld(projectedAnchor.copy(chipAnchor)).project(camera);
        const x = ((projectedAnchor.x + 1) * host.clientWidth) / 2;
        const y = ((1 - projectedAnchor.y) * host.clientHeight) / 2;
        if (
          projectedAnchor.z > -1 &&
          projectedAnchor.z < 1 &&
          x > 40 &&
          x < host.clientWidth - reservedWidth() - 40 &&
          y > 90 &&
          y < host.clientHeight - 40
        ) {
          chip.hidden = false;
          chip.style.left = `${x}px`;
          chip.style.top = `${y}px`;
        }
      }
    }
  };
  const invalidate = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(render);
  };
  controls.addEventListener('change', invalidate);
  let resizeFrame = 0;
  const resize = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    // Keep canvas writes out of ResizeObserver delivery, including modal transitions.
    resizeFrame = requestAnimationFrame(() => {
      if (disposed || !host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      projection();
      invalidate();
    });
  });
  resize.observe(host);
  function disposeObjects() {
    root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose();
          material.dispose();
        }
      }
    });
    root.clear();
    binObjects = [];
    rackInstances = null;
    bodyInstances = null;
    selectedObject = null;
    chip.hidden = true;
  }
  function box(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    tint: THREE.Color,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: tint, roughness: 0.8 }),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function caption(
    parent: THREE.Object3D,
    text: string,
    x: number,
    y: number,
    z: number,
    width: number,
  ) {
    const surface = document.createElement('canvas');
    surface.width = 512;
    surface.height = 80;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = tokens.getPropertyValue('--sc-text-secondary').trim();
    ctx.font = '600 34px Archivo, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 40, 490);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, (width * 80) / 512),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    parent.add(mesh);
  }
  function update(next: SceneData) {
    data = next;
    disposeObjects();
    const { plan, zones, bins, selected } = next;
    controls.enableRotate = !next.editing && !topView;
    chip.textContent = next.selectionLabel ?? '';
    const contextZones = new Set(
      bins.filter((bin) => next.matches?.has(`bin:${bin.id}`)).map((bin) => bin.zoneId),
    );
    const slab = box(
      root,
      plan.width,
      0.35,
      plan.depth,
      plan.width / 2,
      -0.25,
      plan.depth / 2,
      color('bg-surface'),
    );
    slab.castShadow = false;
    const grid = new THREE.GridHelper(
      Math.max(plan.width, plan.depth),
      Math.max(plan.width, plan.depth),
      color('border-strong'),
      color('border-default'),
    );
    grid.position.set(plan.width / 2, -0.06, plan.depth / 2);
    root.add(grid);
    const zoneGroups = new Map<string, THREE.Group>();
    for (const place of plan.zones) {
      const zone = zones.find((item) => item.id === place.zoneId);
      if (!zone) continue;
      const group = new THREE.Group() as EntityObject;
      group.userData = { entity: { kind: 'zone', id: zone.id } };
      group.position.set(place.x, 0, place.z);
      root.add(group);

      zoneGroups.set(zone.id, group);
      const tint = color(
        !zone.isActive
          ? 'bg-muted'
          : zone.zoneType === 'RECEIVING'
            ? 'info-bg'
            : zone.zoneType === 'QUARANTINE'
              ? 'warning-bg'
              : zone.zoneType === 'PACKING'
                ? 'success-bg'
                : 'primary-lighter',
      );
      if (next.matches && !next.matches.has(`zone:${zone.id}`) && !contextZones.has(zone.id)) {
        tint.lerp(color('bg-primary'), 0.75);
      }
      const tile = box(
        group,
        place.width - 0.12,
        0.18,
        place.depth - 0.12,
        place.width / 2,
        0.04,
        place.depth / 2,
        tint,
      );
      tile.castShadow = false;
      caption(
        group,
        zone.code,
        place.width / 2,
        0.15,
        place.depth - 0.55,
        Math.min(place.width - 0.6, 7),
      );
      if (selected?.kind === 'zone' && selected.id === zone.id) {
        selectedObject = group;
        chipAnchor.set(place.width / 2, 0.5, place.depth / 2);
        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(tile.geometry),
          new THREE.LineBasicMaterial({ color: color('primary') }),
        );
        outline.position.copy(tile.position);
        group.add(outline);
      }
    }
    const pieces: THREE.BufferGeometry[] = [];
    for (const x of [0.08, 0.92]) {
      for (const z of [0.08, 0.92]) {
        pieces.push(new THREE.BoxGeometry(0.06, 1.1, 0.06).translate(x, 0.55, z));
      }
    }
    for (const y of [0.08, 1.1]) {
      pieces.push(new THREE.BoxGeometry(0.95, 0.08, 0.95).translate(0.5, y, 0.5));
    }
    const rackGeometry = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    rackInstances = new THREE.InstancedMesh(
      rackGeometry,
      new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      plan.bins.length,
    );
    bodyInstances = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.75, 0.65, 0.7).translate(0.5, 0.45, 0.5),
      new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      plan.bins.length,
    );
    rackInstances.castShadow = true;
    bodyInstances.castShadow = true;
    root.add(rackInstances, bodyInstances);
    for (const place of plan.bins) {
      const bin = bins.find((item) => item.id === place.binId);
      if (!bin) continue;
      const parent = zoneGroups.get(bin.zoneId);
      if (!parent) continue;
      const group = new THREE.Group() as EntityObject;
      group.userData = { entity: { kind: 'bin', id: bin.id } };
      group.position.set(place.x, 0.18, place.z);
      parent.add(group);

      const tint = color(
        !bin.isActive
          ? 'secondary-light'
          : selected?.kind === 'bin' && selected.id === bin.id
            ? 'primary'
            : 'info',
      );
      const matched = !next.matches || next.matches.has(visualEntityKey(group.userData.entity));
      if (!matched && selected?.id !== bin.id) tint.lerp(color('bg-primary'), 0.8);
      rackInstances.setColorAt(binObjects.length, color(matched ? 'secondary-light' : 'bg-muted'));
      bodyInstances.setColorAt(binObjects.length, tint);
      binObjects.push(group);
      if (selected?.kind === 'bin' && selected.id === bin.id) {
        selectedObject = group;
        chipAnchor.set(0.5, 1.5, 0.5);
        const marker = new THREE.Mesh(
          new THREE.RingGeometry(0.65, 0.74, 32),
          new THREE.MeshBasicMaterial({ color: color('primary'), side: THREE.DoubleSide }),
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(0.5, 0.02, 0.5);
        group.add(marker);
      }
    }
    rackInstances.count = binObjects.length;
    bodyInstances.count = binObjects.length;
    updateInstances();
    invalidate();
  }
  function updateInstances() {
    root.updateMatrixWorld(true);
    binObjects.forEach((object, index) => {
      rackInstances?.setMatrixAt(index, object.matrixWorld);
      bodyInstances?.setMatrixAt(index, object.matrixWorld);
    });
    for (const mesh of [rackInstances, bodyInstances]) {
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    }
  }
  function frameBounds(
    bounds: { x: number; z: number; width: number; depth: number },
    top: boolean,
  ) {
    projection();
    const cx = bounds.x + bounds.width / 2,
      cz = bounds.z + bounds.depth / 2;
    const distance = warehouseCameraDistance(
      bounds,
      camera.aspect,
      camera.fov,
      Math.max(0.2, (host.clientWidth - reservedWidth()) / Math.max(1, host.clientWidth)),
    );
    controls.target.set(cx, 0.5, cz);
    camera.position.copy(
      new THREE.Vector3(top ? 0 : 0.7, top ? 1 : 1.2, top ? 0.00001 : 0.9)
        .normalize()
        .multiplyScalar(distance)
        .add(controls.target),
    );
    controls.update();
    invalidate();
  }
  function home(top: boolean) {
    if (data) frameBounds({ x: 0, z: 0, width: data.plan.width, depth: data.plan.depth }, top);
  }
  function ray(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(floor, new THREE.Vector3());
  }
  function down(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || !data) return;
    const point = ray(event);
    if (!point) return;
    const hits = raycaster.intersectObjects(root.children, true);
    let picked: EntityObject | null = null;
    for (const hit of hits) {
      if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
        picked = binObjects[hit.instanceId] ?? null;
        if (picked) break;
      }
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData['entity']) object = object.parent;
      if (object) {
        picked = object as EntityObject;
        break;
      }
    }
    if (!picked) return;
    const entity = picked.userData.entity;
    const world = picked.getWorldPosition(new THREE.Vector3());
    drag = {
      entity,
      object: picked,
      offset: point.clone().sub(world),
      origin: picked.position.clone(),
      downX: event.clientX,
      downY: event.clientY,
      pointerId: event.pointerId,
    };
    if (data.editing) {
      controls.enabled = false;
      canvas.setPointerCapture(event.pointerId);
    }
  }
  function move(event: PointerEvent) {
    if (!drag || !data?.editing || drag.pointerId !== event.pointerId) return;
    const point = ray(event);
    if (!point) return;
    point.sub(drag.offset);
    if (drag.entity.kind === 'bin') drag.object.parent?.worldToLocal(point);
    drag.object.position.set(Math.round(point.x), drag.origin.y, Math.round(point.z));
    updateInstances();
    invalidate();
  }
  function up(event: PointerEvent) {
    const current = drag;
    if (!current || current.pointerId !== event.pointerId) return;
    drag = null;
    controls.enabled = true;
    const moved = Math.hypot(event.clientX - current.downX, event.clientY - current.downY) > 4;
    const next = current.object.position.clone();
    current.object.position.copy(current.origin);
    updateInstances();
    if (event.type !== 'pointercancel') {
      if (moved && data?.editing) callbacks.move(current.entity, next.x, next.z);
      else if (!moved) callbacks.select(current.entity);
    }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    invalidate();
  }
  const lost = (event: Event) => {
    event.preventDefault();
    callbacks.unavailable();
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  return {
    update,
    home,
    focus(entity: VisualEntity) {
      if (!data) return;
      const bounds = warehouseEntityBounds(entity, data.plan, data.bins);
      if (bounds) frameBounds(bounds, data.editing || topView);
    },
    setTopView(top: boolean) {
      topView = top;
      controls.enableRotate = !top && !data?.editing;
      controls.mouseButtons.LEFT = top ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      controls.touches.ONE = top ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      home(top);
    },
    zoom(factor: number) {
      camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
      controls.update();
      invalidate();
    },
    rotate() {
      const offset = camera.position
        .clone()
        .sub(controls.target)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      invalidate();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
      resize.disconnect();
      controls.dispose();
      disposeObjects();
      sun.shadow.dispose();
      renderer.dispose();
      canvas.removeEventListener('webglcontextlost', lost);
      renderer.forceContextLoss();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.remove();
      chip.remove();
    },
  };
}
