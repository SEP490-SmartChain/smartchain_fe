/**
 * HERE Maps API for JavaScript is loaded from HERE's CDN on demand (it is not an npm package).
 * Only the small part of `window.H` that the warehouse picker uses is typed here.
 * Docs: https://docs.here.com/maps-api-for-js/docs/quick-start
 */
const BASE = 'https://js.api.here.com/v3/3.2';
const SCRIPTS = ['mapsjs-core.js', 'mapsjs-service.js', 'mapsjs-mapevents.js', 'mapsjs-ui.js'];

export interface HerePoint {
  lat: number;
  lng: number;
}
export interface HereEvent {
  target: unknown;
  currentPointer: { viewportX: number; viewportY: number };
}
export interface HereMarker {
  draggable: boolean;
  setGeometry(point: HerePoint): void;
}
export interface HereMap {
  addObject(object: unknown): void;
  removeObject(object: unknown): void;
  setCenter(point: HerePoint): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  screenToGeo(x: number, y: number): HerePoint;
  addEventListener(type: string, listener: (event: HereEvent) => void): void;
  getViewPort(): { resize(): void };
  dispose(): void;
}
/** Without `features` the call affects every behaviour; with it, only those bit flags. */
export interface HereBehavior {
  enable(features?: number): void;
  disable(features?: number): void;
}
export interface HereSearchItem {
  title: string;
  position?: HerePoint;
}
export interface HereSearchService {
  geocode(
    params: { q: string; in: string; limit: number; lang: string },
    onResult: (result: { items: HereSearchItem[] }) => void,
    onError: (error: unknown) => void,
  ): void;
}
export interface HerePlatform {
  createDefaultLayers(): { vector: { normal: { map: unknown } } };
  getSearchService(): HereSearchService;
}
export interface HereNamespace {
  service: { Platform: new (options: { apikey: string }) => HerePlatform };
  Map: new (
    element: HTMLElement,
    layer: unknown,
    options: { zoom: number; center: HerePoint; pixelRatio?: number },
  ) => HereMap;
  mapevents: {
    MapEvents: new (map: HereMap) => unknown;
    Behavior: (new (events: unknown) => HereBehavior) & {
      DRAGGING: number;
      WHEELZOOM: number;
    };
  };
  ui: { UI: { createDefault(map: HereMap, layers: unknown): unknown } };
  map: { Marker: new (point: HerePoint) => HereMarker };
}

declare global {
  interface Window {
    H?: HereNamespace;
  }
}

function addScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('HERE_SCRIPT_LOAD_FAILED'));
    document.head.appendChild(script);
  });
}

let loading: Promise<HereNamespace> | null = null;

/** Loads the HERE modules once, in dependency order (core first). */
export function loadHereMaps(): Promise<HereNamespace> {
  if (window.H?.service && window.H.ui) return Promise.resolve(window.H);
  if (!loading) {
    loading = (async () => {
      if (!document.querySelector('link[data-here-ui]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${BASE}/mapsjs-ui.css`;
        link.dataset['hereUi'] = 'true';
        document.head.appendChild(link);
      }
      for (const file of SCRIPTS) await addScript(`${BASE}/${file}`);
      if (!window.H) throw new Error('HERE_NOT_AVAILABLE');
      return window.H;
    })().catch((error: unknown) => {
      loading = null; // allow a retry after a network failure
      throw error;
    });
  }
  return loading;
}
