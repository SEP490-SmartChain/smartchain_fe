import { useRef, useEffect, useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface LandingCanvasHandle {
  setCameraTarget: (x: number, y: number, z: number) => void;
  setCameraPos: (x: number, y: number, z: number) => void;
  setAccentColor: (hex: string) => void;
  setSceneIndex: (idx: number) => void;
}

export interface LandingCanvasProps {
  onSelectNode?: (idx: number) => void;
}

export const NODES_DATA = [
  {
    id: 0,
    stopIdx: 1,
    tag: 'NỖI ĐAU 01',
    name: 'Tồn Kho Mù & Chọn Kho Thủ Công',
    shortLabel: 'Tồn Kho Mù',
    code: 'PAIN-01',
    pos: [-2.6, 0, -2.6] as [number, number, number],
    accent: '#FFB800',
    icon: '⚠️',
  },
  {
    id: 1,
    stopIdx: 2,
    tag: 'NỖI ĐAU 02',
    name: 'Giao Xa, Trễ Hạn & Hoàn Đơn',
    shortLabel: 'Trễ Hạn & Hoàn Đơn',
    code: 'PAIN-02',
    pos: [2.6, 0, -2.6] as [number, number, number],
    accent: '#FF4444',
    icon: '⏱️',
  },
  {
    id: 2,
    stopIdx: 3,
    tag: 'GIẢI PHÁP 01',
    name: 'Smart Routing Tối Ưu Tọa Độ',
    shortLabel: 'Smart Routing',
    code: 'SOL-01',
    pos: [2.6, 0, 2.6] as [number, number, number],
    accent: '#A855F7',
    icon: '⚡',
  },
  {
    id: 3,
    stopIdx: 4,
    tag: 'GIẢI PHÁP 02',
    name: 'Rate Shopping Đấu Giá Cước',
    shortLabel: 'Rate Shopping',
    code: 'SOL-02',
    pos: [-2.6, 0, 2.6] as [number, number, number],
    accent: '#00B4FF',
    icon: '💰',
  },
];

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3],
];

// ── Orbital Dust Cloud (ThreeUI-inspired: Orbital Dust + Constellation Field) ──
function OrbitalDust({ count = 280, color }: { count?: number; color: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  const positions = useMemo(() => {
    const arr: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const r = 4.5 + Math.random() * 6.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.55;
      arr.push(new THREE.Vector3(
        r * Math.cos(phi) * Math.cos(theta),
        r * Math.sin(phi) * 0.7 - 0.5 + Math.random() * 2.2,
        r * Math.cos(phi) * Math.sin(theta),
      ));
    }
    return arr;
  }, [count]);

  const speeds = useMemo(() => Array.from({ length: count }, () => 0.06 + Math.random() * 0.14), [count]);
  const phases = useMemo(() => Array.from({ length: count }, () => Math.random() * Math.PI * 2), [count]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    t.current += delta;
    for (let i = 0; i < count; i++) {
      const p = positions[i];
      dummy.position.set(
        p.x + Math.sin(t.current * speeds[i] + phases[i]) * 0.12,
        p.y + Math.cos(t.current * speeds[i] * 0.7 + phases[i]) * 0.08,
        p.z + Math.cos(t.current * speeds[i] + phases[i] * 1.3) * 0.12,
      );
      const s = 0.025 + Math.sin(t.current * speeds[i] * 2 + phases[i]) * 0.012;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  const dustColor = useMemo(() => new THREE.Color(color), [color]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshStandardMaterial
        color={dustColor}
        emissive={dustColor}
        emissiveIntensity={2.2}
        transparent
        opacity={0.55}
      />
    </instancedMesh>
  );
}

// ── Radar Scan Wave (ThreeUI-inspired: Haversine Radius Ring pulse) ─────────────
function RadarWave({ position, color, active }: {
  position: [number, number, number];
  color: string;
  active: boolean;
}) {
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    if (!active) return;
    t.current += delta;

    const p1 = (t.current * 0.55) % 1;
    const p2 = ((t.current * 0.55) + 0.5) % 1;

    if (ring1.current) {
      const s1 = 0.5 + p1 * 2.8;
      ring1.current.scale.setScalar(s1);
      (ring1.current.material as THREE.MeshStandardMaterial).opacity = (1 - p1) * 0.55;
    }
    if (ring2.current) {
      const s2 = 0.5 + p2 * 2.8;
      ring2.current.scale.setScalar(s2);
      (ring2.current.material as THREE.MeshStandardMaterial).opacity = (1 - p2) * 0.55;
    }
  });

  if (!active) return null;

  return (
    <group position={[position[0], -0.34, position[2]]}>
      <mesh ref={ring1} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 0.68, 48]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={3.5}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring2} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 0.68, 48]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={3.5}
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Laser Glow Stream (ThreeUI-inspired: Stream Convergence with data packets) ─
function LaserStream({
  from,
  to,
  color,
  speed = 0.35,
  offset = 0,
  active = true,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  speed?: number;
  offset?: number;
  active?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const t = useRef(offset);

  const curve = useMemo(() => {
    const midX = (from[0] + to[0]) / 2;
    const midY = Math.max(from[1], to[1]) + 1.4;
    const midZ = (from[2] + to[2]) / 2;
    return new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...from),
      new THREE.Vector3(midX, midY, midZ),
      new THREE.Vector3(...to),
    );
  }, [from, to]);

  useFrame((_, delta) => {
    if (!active || !ref.current) return;
    t.current = (t.current + delta * speed) % 1;
    const pos = curve.getPoint(t.current);
    ref.current.position.copy(pos);
    if (glowRef.current) glowRef.current.position.copy(pos);
  });

  if (!active) return null;

  const c = new THREE.Color(color);

  return (
    <>
      {/* Core bright packet */}
      <mesh ref={ref}>
        <boxGeometry args={[0.1, 0.07, 0.1]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={8} />
      </mesh>
      {/* Glow halo around packet */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshStandardMaterial
          color={c}
          emissive={c}
          emissiveIntensity={3}
          transparent
          opacity={0.28}
        />
      </mesh>
    </>
  );
}

// ── Connection Route with Glow Line ───────────────────────────────────────────
function ConnectionRoute({
  from,
  to,
  color,
  broken = false,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  broken?: boolean;
}) {
  const pts = useMemo(() => {
    const midX = (from[0] + to[0]) / 2;
    const midY = Math.max(from[1], to[1]) + 0.45;
    const midZ = (from[2] + to[2]) / 2;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...from),
      new THREE.Vector3(midX, midY, midZ),
      new THREE.Vector3(...to),
    );
    return curve.getPoints(24).map((p) => [p.x, p.y, p.z] as [number, number, number]);
  }, [from, to]);

  if (broken) {
    return (
      <Line
        points={pts}
        color="#FF3333"
        lineWidth={1.2}
        transparent
        opacity={0.35}
        dashed
        dashScale={2}
      />
    );
  }

  return (
    <Line
      points={pts}
      color={color}
      lineWidth={1.8}
      transparent
      opacity={0.7}
    />
  );
}

// ── Warehouse Node ─────────────────────────────────────────────────────────────
function WarehouseNode({
  node,
  globalColor,
  activeSceneIdx,
  onSelect,
}: {
  node: typeof NODES_DATA[0];
  globalColor: string;
  activeSceneIdx: number;
  onSelect?: (idx: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const bodyRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const domeRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const t = useRef(Math.random() * Math.PI * 2);

  const isFocused = activeSceneIdx === node.stopIdx;
  const isCrisis = activeSceneIdx === 2 && (node.id === 0 || node.id === 1);
  const nodeColor = isCrisis ? '#FF4444' : isFocused || hovered ? node.accent : globalColor;

  useFrame((_, delta) => {
    t.current += delta;
    const floatY = Math.sin(t.current * 0.8 + node.id) * (isFocused || hovered ? 0.09 : 0.04);
    const targetY = node.pos[1] + (isFocused || hovered ? 0.35 : 0) + floatY;

    if (bodyRef.current) {
      bodyRef.current.position.y += (targetY - bodyRef.current.position.y) * 0.1;
      const targetScale = isFocused ? 1.2 : hovered ? 1.12 : 1.0;
      bodyRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * (isFocused || hovered ? 1.4 : 0.5);
    }
    if (domeRef.current) {
      domeRef.current.rotation.y += delta * 0.3;
      domeRef.current.scale.setScalar(isFocused || hovered ? 1 + 0.08 * Math.sin(t.current * 3) : 0.001);
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(isFocused || hovered ? 1.6 + 0.25 * Math.sin(t.current * 2.5) : 1.0);
    }
  });

  return (
    <group
      position={node.pos}
      onClick={(e) => { e.stopPropagation(); onSelect?.(node.stopIdx); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
    >
      {/* Invisible Large Hitbox */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 1.8, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Ground Glow */}
      <mesh ref={glowRef} position={[0, -0.3, 0]}>
        <sphereGeometry args={[0.75, 16, 16]} />
        <meshStandardMaterial
          color={nodeColor}
          transparent
          opacity={isFocused || hovered ? 0.38 : 0.14}
          emissive={nodeColor}
          emissiveIntensity={isFocused || hovered ? 2.2 : 0.7}
        />
      </mesh>

      {/* Radar Ring */}
      <mesh ref={ringRef} position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.68, 0.8, 32]} />
        <meshStandardMaterial
          color={nodeColor}
          emissive={nodeColor}
          emissiveIntensity={isFocused || hovered ? 3 : 1.2}
          transparent
          opacity={isFocused || hovered ? 0.85 : 0.35}
        />
      </mesh>

      {/* Shield Dome */}
      <mesh ref={domeRef} position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.95, 18, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color={nodeColor}
          emissive={nodeColor}
          emissiveIntensity={1.5}
          wireframe
          transparent
          opacity={isFocused || hovered ? 0.35 : 0}
        />
      </mesh>

      {/* Warehouse Building */}
      <mesh ref={bodyRef} castShadow>
        <boxGeometry args={[0.85, 0.55, 0.85]} />
        <meshStandardMaterial color="#0b1724" emissive="#040c14" emissiveIntensity={isFocused || hovered ? 0.8 : 0.3} roughness={0.2} metalness={0.9} />
      </mesh>

      {/* Glowing Roof Rim */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.88, 0.04, 0.88]} />
        <meshStandardMaterial color={nodeColor} emissive={nodeColor} emissiveIntensity={isFocused || hovered ? 5 : 2.2} transparent opacity={0.95} />
      </mesh>

      {/* Roof Pyramid */}
      <mesh position={[0, 0.56, 0]}>
        <coneGeometry args={[0.62, 0.4, 4]} />
        <meshStandardMaterial color="#06121e" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Corner Beacons */}
      {[[-0.4, 0, -0.4], [0.4, 0, -0.4], [-0.4, 0, 0.4], [0.4, 0, 0.4]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <boxGeometry args={[0.065, 0.6, 0.065]} />
          <meshStandardMaterial color={nodeColor} emissive={nodeColor} emissiveIntensity={isFocused || hovered ? 5 : 2.2} />
        </mesh>
      ))}

      {/* AR Pin */}
      <Html position={[0, 0.9, 0]} center className="select-none pointer-events-auto">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect?.(node.stopIdx); }}
          className="group flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono tracking-wide font-bold whitespace-nowrap backdrop-blur-md border transition-all duration-300 shadow-md cursor-pointer hover:scale-110 active:scale-95"
          style={{
            background: isFocused ? `${node.accent}33` : hovered ? 'rgba(255,255,255,0.2)' : 'rgba(5,11,20,0.85)',
            borderColor: isFocused || hovered ? nodeColor : 'rgba(255,255,255,0.15)',
            color: isFocused || hovered ? '#ffffff' : '#CBD5E1',
            boxShadow: isFocused || hovered ? `0 0 18px ${nodeColor}88` : 'none',
          }}
        >
          <span className={`w-2 h-2 rounded-full ${isFocused ? 'animate-ping' : ''}`} style={{ background: nodeColor }} />
          <span>{node.shortLabel}</span>
          <span className="text-[8px] opacity-60">[{node.code}]</span>
        </button>
      </Html>
    </group>
  );
}

// ── Central SmartChain Core ────────────────────────────────────────────────────
function CentralSmartChainCore({
  color,
  activeSceneIdx,
  onSelect,
}: {
  color: string;
  activeSceneIdx: number;
  onSelect?: (idx: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const octRef = useRef<THREE.Mesh>(null);
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const innerGlowRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  const isFocusedCore = activeSceneIdx === 5;
  const coreColor = isFocusedCore || hovered ? '#00E599' : color;

  useFrame((_, delta) => {
    t.current += delta;
    if (octRef.current) {
      octRef.current.rotation.y += delta * (isFocusedCore || hovered ? 3 : 0.9);
      octRef.current.rotation.x += delta * (isFocusedCore || hovered ? 1.4 : 0.45);
      const scale = isFocusedCore || hovered
        ? 1.4 + 0.18 * Math.sin(t.current * 4)
        : 1.0 + 0.09 * Math.sin(t.current * 2);
      octRef.current.scale.setScalar(scale);
    }
    if (ring1.current) ring1.current.rotation.z += delta * (isFocusedCore || hovered ? 1.8 : 0.55);
    if (ring2.current) ring2.current.rotation.x += delta * (isFocusedCore || hovered ? 1.4 : 0.38);
    if (innerGlowRef.current) {
      innerGlowRef.current.scale.setScalar(isFocusedCore || hovered
        ? 1.2 + 0.3 * Math.sin(t.current * 3)
        : 0.8 + 0.1 * Math.sin(t.current * 1.5));
    }
  });

  return (
    <group
      position={[0, 0.45, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect?.(5); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
    >
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1.2, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Inner glow orb */}
      <mesh ref={innerGlowRef}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={isFocusedCore || hovered ? 6 : 3}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Core Octahedron */}
      <mesh ref={octRef}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial color={coreColor} emissive={coreColor} emissiveIntensity={isFocusedCore || hovered ? 5 : 2.8} wireframe />
      </mesh>

      {/* Orbit ring 1 */}
      <mesh ref={ring1} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.78, 0.028, 8, 56]} />
        <meshStandardMaterial color={coreColor} emissive={coreColor} emissiveIntensity={isFocusedCore || hovered ? 4.5 : 2.8} transparent opacity={0.88} />
      </mesh>

      {/* Orbit ring 2 */}
      <mesh ref={ring2} rotation={[0, 0, Math.PI / 4]}>
        <torusGeometry args={[0.62, 0.02, 6, 40]} />
        <meshStandardMaterial color={coreColor} emissive={coreColor} emissiveIntensity={isFocusedCore || hovered ? 3.8 : 2.2} transparent opacity={0.72} />
      </mesh>

      {/* SmartChain Label */}
      <Html position={[0, 0.92, 0]} center className="select-none pointer-events-auto">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect?.(5); }}
          className="group flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-mono font-bold tracking-wide border backdrop-blur-md transition-all duration-300 whitespace-nowrap shadow-lg cursor-pointer hover:scale-110 active:scale-95"
          style={{
            background: isFocusedCore || hovered ? 'rgba(0,229,153,0.35)' : 'rgba(5,11,20,0.85)',
            borderColor: coreColor,
            color: '#ffffff',
            boxShadow: `0 0 22px ${coreColor}88`,
          }}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>⚡ SmartChain</span>
        </button>
      </Html>
    </group>
  );
}

// ── Grid Floor ────────────────────────────────────────────────────────────────
function GridFloor({ color }: { color: string }) {
  return (
    <group position={[0, -0.85, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[28, 28, 26, 26]} />
        <meshStandardMaterial
          color={color === '#FF4444' ? '#220505' : '#031222'}
          wireframe
          transparent
          opacity={0.22}
        />
      </mesh>
    </group>
  );
}

// ── Camera Rig ─────────────────────────────────────────────────────────────────
function CameraRig({
  posRef,
  lookRef,
  mouseRef,
}: {
  posRef: React.RefObject<THREE.Vector3>;
  lookRef: React.RefObject<THREE.Vector3>;
  mouseRef: React.RefObject<{ x: number; y: number }>;
}) {
  const { camera } = useThree();

  useFrame(() => {
    if (!posRef.current || !lookRef.current) return;
    const mo = mouseRef.current ?? { x: 0, y: 0 };
    const desiredPos = posRef.current.clone().add(
      new THREE.Vector3(mo.x * 0.65, mo.y * 0.35, (mo.x + mo.y) * 0.08)
    );
    camera.position.lerp(desiredPos, 0.048);
    const lookMatrix = new THREE.Matrix4().lookAt(camera.position, lookRef.current, camera.up);
    camera.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(lookMatrix), 0.048);
  });

  return null;
}

// ── Main 3D Scene ──────────────────────────────────────────────────────────────
function MainScene({
  posRef,
  lookRef,
  accentRef,
  mouseRef,
  sceneIndexRef,
  onSelectNode,
}: {
  posRef: React.RefObject<THREE.Vector3>;
  lookRef: React.RefObject<THREE.Vector3>;
  accentRef: React.RefObject<string>;
  mouseRef: React.RefObject<{ x: number; y: number }>;
  sceneIndexRef: React.RefObject<number>;
  onSelectNode?: (idx: number) => void;
}) {
  const color = accentRef.current ?? '#00E599';
  const activeSceneIdx = sceneIndexRef.current ?? 0;
  const isCrisis = activeSceneIdx === 2 || color === '#FF4444';

  // Laser stream glow color based on scene
  const streamColor = isCrisis ? '#FF4444'
    : activeSceneIdx === 3 ? '#A855F7'
    : activeSceneIdx === 4 ? '#00B4FF'
    : '#00E599';

  return (
    <group position={[0, 0.65, 0]}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[8, 14, 8]} intensity={0.9} />
      <pointLight position={[0, 4, 0]} color={color} intensity={isCrisis ? 5 : 3.5} distance={18} />
      {isCrisis && <pointLight position={[0, 1, 0]} color="#FF3333" intensity={7} distance={14} />}
      {/* Lens Flare point at core */}
      <pointLight position={[0, 0.5, 0]} color={color} intensity={1.5} distance={6} />

      {/* ── Orbital Dust Cloud (ThreeUI: Orbital Dust) ── */}
      <OrbitalDust count={260} color={color} />

      <GridFloor color={color} />
      <CentralSmartChainCore color={color} activeSceneIdx={activeSceneIdx} onSelect={onSelectNode} />

      {/* Radar Scan Waves on focused node */}
      {NODES_DATA.map((node) => (
        <RadarWave
          key={node.id}
          position={node.pos}
          color={node.accent}
          active={activeSceneIdx === node.stopIdx}
        />
      ))}

      {/* 4 Interactive Nodes */}
      {NODES_DATA.map((node) => (
        <WarehouseNode
          key={node.id}
          node={node}
          globalColor={color}
          activeSceneIdx={activeSceneIdx}
          onSelect={onSelectNode}
        />
      ))}

      {/* ── Connection Route Lines ── */}
      {CONNECTIONS.map(([a, b], i) => {
        const fromP: [number, number, number] = [NODES_DATA[a].pos[0], NODES_DATA[a].pos[1] + 0.3, NODES_DATA[a].pos[2]];
        const toP: [number, number, number] = [NODES_DATA[b].pos[0], NODES_DATA[b].pos[1] + 0.3, NODES_DATA[b].pos[2]];
        return (
          <ConnectionRoute key={i} from={fromP} to={toP} color={color} broken={isCrisis} />
        );
      })}

      {/* ── Laser Glow Streams (ThreeUI: Stream Convergence) ── */}
      {!isCrisis && CONNECTIONS.map(([a, b], i) => (
        <LaserStream
          key={i}
          from={[NODES_DATA[a].pos[0], NODES_DATA[a].pos[1] + 0.35, NODES_DATA[a].pos[2]]}
          to={[NODES_DATA[b].pos[0], NODES_DATA[b].pos[1] + 0.35, NODES_DATA[b].pos[2]]}
          color={streamColor}
          speed={0.22 + i * 0.04}
          offset={i * 0.17}
          active={true}
        />
      ))}

      <CameraRig posRef={posRef} lookRef={lookRef} mouseRef={mouseRef} />
    </group>
  );
}

// ── Public Canvas Export ───────────────────────────────────────────────────────
const LandingCanvas = forwardRef<LandingCanvasHandle, LandingCanvasProps>(
  ({ onSelectNode }, ref) => {
    const posRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 6.8, 8.5));
    const lookRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.65, 0));
    const accentRef = useRef<string>('#00E599');
    const sceneIndexRef = useRef<number>(0);
    const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
        mouseRef.current = {
          x: (e.clientX / window.innerWidth - 0.5) * 2,
          y: -(e.clientY / window.innerHeight - 0.5) * 2,
        };
      };
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
      return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    useImperativeHandle(ref, () => ({
      setCameraPos(x, y, z) { posRef.current.set(x, y, z); },
      setCameraTarget(x, y, z) { lookRef.current.set(x, y, z); },
      setAccentColor(hex) { accentRef.current = hex; },
      setSceneIndex(idx) { sceneIndexRef.current = idx; },
    }));

    return (
      // Wider FOV (50°) + closer initial camera = bigger scene feel
      <Canvas
        camera={{ position: [0, 6.8, 8.5], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent', pointerEvents: 'auto' }}
      >
        <MainScene
          posRef={posRef}
          lookRef={lookRef}
          accentRef={accentRef}
          mouseRef={mouseRef}
          sceneIndexRef={sceneIndexRef}
          onSelectNode={onSelectNode}
        />
      </Canvas>
    );
  }
);

LandingCanvas.displayName = 'LandingCanvas';
export default LandingCanvas;
