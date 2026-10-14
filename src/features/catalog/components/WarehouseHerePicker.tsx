import { useEffect, useMemo, useRef, useState } from 'react';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/Common/Button/Button';
import { Input } from '@/components/Common/Input/Input';

import {
  loadHereMaps,
  type HereBehavior,
  type HereMap,
  type HereMarker,
  type HerePlatform,
  type HerePoint,
} from '../lib/hereMaps';
import { isValidCoordinate } from '../utils/locationCoordinates';

interface Props {
  latitude: number | undefined;
  longitude: number | undefined;
  /** Province/ward/street preview used to prefill the search box. */
  searchText: string;
  apiKey: string;
  onChange: (latitude: number, longitude: number) => void;
}

type Result = { title: string; position: HerePoint };

// Viewport only (whole of Vietnam). It is never used as a warehouse coordinate.
const VIETNAM_CENTER: HerePoint = { lat: 16.0, lng: 106.0 };

/** Map picker for the warehouse form: search an address or click/drag the pin to set coordinates. */
export default function WarehouseHerePicker({
  latitude,
  longitude,
  searchText,
  apiKey,
  onChange,
}: Props) {
  const t = useTranslations('Warehouses');
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HereMap | null>(null);
  const markerRef = useRef<HereMarker | null>(null);
  const platformRef = useRef<HerePlatform | null>(null);
  const onChangeRef = useRef(onChange);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState(searchText);
  const [results, setResults] = useState<Result[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const touched = useRef(false);
  const request = useRef(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const position = useMemo<HerePoint | null>(
    () =>
      isValidCoordinate(latitude, longitude)
        ? { lat: latitude as number, lng: longitude as number }
        : null,
    [latitude, longitude],
  );
  const initialPosition = useRef(position);

  // Create the map once; React state changes only move the marker afterwards.
  useEffect(() => {
    let disposed = false;
    let behavior: HereBehavior | null = null;
    let onResize: (() => void) | null = null;
    void loadHereMaps()
      .then((H) => {
        if (disposed || !container.current) return;
        const platform = new H.service.Platform({ apikey: apiKey });
        platformRef.current = platform;
        const layers = platform.createDefaultLayers();
        const start = initialPosition.current;
        const map = new H.Map(container.current, layers.vector.normal.map, {
          zoom: start ? 16 : 5,
          center: start ?? VIETNAM_CENTER,
          pixelRatio: window.devicePixelRatio || 1,
        });
        mapRef.current = map;
        behavior = new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
        H.ui.UI.createDefault(map, layers);

        const place = (point: HerePoint) => {
          if (markerRef.current) markerRef.current.setGeometry(point);
          else {
            const marker = new H.map.Marker(point);
            marker.draggable = true;
            markerRef.current = marker;
            map.addObject(marker);
          }
          onChangeRef.current(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)));
        };
        if (start) {
          const marker = new H.map.Marker(start);
          marker.draggable = true;
          markerRef.current = marker;
          map.addObject(marker);
        }
        map.addEventListener('tap', (event) => {
          place(map.screenToGeo(event.currentPointer.viewportX, event.currentPointer.viewportY));
        });
        // While a marker is dragged the map itself must not pan.
        map.addEventListener('dragstart', (event) => {
          if (event.target === markerRef.current) behavior?.disable(H.mapevents.Behavior.DRAGGING);
        });
        map.addEventListener('drag', (event) => {
          if (event.target === markerRef.current) {
            markerRef.current?.setGeometry(
              map.screenToGeo(event.currentPointer.viewportX, event.currentPointer.viewportY),
            );
          }
        });
        map.addEventListener('dragend', (event) => {
          if (event.target !== markerRef.current) return;
          behavior?.enable(H.mapevents.Behavior.DRAGGING);
          place(map.screenToGeo(event.currentPointer.viewportX, event.currentPointer.viewportY));
        });
        onResize = () => map.getViewPort().resize();
        window.addEventListener('resize', onResize);
      })
      .catch(() => {
        if (!disposed) setLoadError(true);
      });
    return () => {
      disposed = true;
      if (onResize) window.removeEventListener('resize', onResize);
      mapRef.current?.dispose();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [apiKey]);

  // Typing coordinates by hand moves the pin and recentres the map.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !position) return;
    if (marker) marker.setGeometry(position);
    map.setCenter(position);
  }, [position]);

  useEffect(() => {
    if (!touched.current) setQuery(searchText);
  }, [searchText]);

  const handleSearch = () => {
    const text = query.trim();
    const platform = platformRef.current;
    if (text.length < 3 || !platform) return;
    const id = ++request.current;
    setSearching(true);
    setSearchError(false);
    // Search runs only on an explicit action, never while typing.
    platform.getSearchService().geocode(
      { q: text, in: 'countryCode:VNM', limit: 5, lang: 'vi' },
      (result) => {
        if (id !== request.current) return;
        setResults(
          result.items
            .filter(
              (item) => item.position && isValidCoordinate(item.position.lat, item.position.lng),
            )
            .map((item) => ({ title: item.title, position: item.position as HerePoint })),
        );
        setSearching(false);
      },
      () => {
        if (id !== request.current) return;
        setResults(null);
        setSearchError(true);
        setSearching(false);
      },
    );
  };

  const pick = (point: HerePoint) => {
    const map = mapRef.current;
    if (!map) return;
    onChangeRef.current(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)));
    map.setCenter(point);
    map.setZoom(Math.max(map.getZoom(), 16));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label={t('searchAddress')}
            value={query}
            maxLength={200}
            onChange={(event) => {
              touched.current = true;
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSearch();
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" isLoading={searching} onClick={handleSearch}>
          <Search size={16} aria-hidden="true" />
          {t('search')}
        </Button>
      </div>
      {searchError && (
        <p role="alert" className="text-sm text-[var(--sc-error)]">
          {t('searchUnavailable')}
        </p>
      )}
      {results && results.length === 0 && (
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('searchNoResult')}</p>
      )}
      {results && results.length > 0 && (
        <p className="text-sm text-[var(--sc-text-secondary)]">{t('pickResultHint')}</p>
      )}
      {results && results.length > 0 && (
        <ul className="divide-y divide-[var(--sc-border-default)] rounded-lg border border-[var(--sc-border-default)]">
          {results.map((row) => (
            <li key={`${row.position.lat},${row.position.lng},${row.title}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-[var(--sc-text-primary)] hover:bg-[var(--sc-bg-secondary)]"
                onClick={() => pick(row.position)}
              >
                {row.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {loadError ? (
        <p role="alert" className="text-sm text-[var(--sc-error)]">
          {t('mapLoadError')}
        </p>
      ) : (
        <div
          ref={container}
          className="h-72 overflow-hidden rounded-lg border border-[var(--sc-border-default)]"
          role="application"
          aria-label={t('mapLabel')}
        />
      )}
      <p className="text-sm text-[var(--sc-text-secondary)]">{t('mapHint')}</p>
    </div>
  );
}
