'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Feature, Polygon } from 'geojson';
import { BASE_STYLES, DATA_LAYERS, LAYER_IDS, nasaWmsTileUrl } from '@/lib/layers';
import type { Coordinates, LayerId, LayerStatus, MapStyleId } from '@/lib/types';
import { boundingSquare, circlePolygon, squarePolygon } from '@/lib/geo.mjs';

type Props = {
  token: string;
  selection: Coordinates | null;
  radius: number;
  styleId: MapStyleId;
  enabledLayers: LayerId[];
  layerStatuses: LayerStatus[];
  onSelect: (coords: Coordinates) => void;
  focus: { coords: Coordinates; nonce: number } | null;
  onReady?: (map: mapboxgl.Map | null) => void;
  showBounds: boolean;
};

const CENTER: Coordinates = [20.995, 42.009];
const empty = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export default function MapCanvas({ token, selection, radius, styleId, enabledLayers, layerStatuses, onSelect, focus, onReady, showBounds }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);
  const [styleVersion, setStyleVersion] = useState(0);
  onSelectRef.current = onSelect;
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!token || !container.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: container.current,
      style: BASE_STYLES.satellite.url,
      center: CENTER,
      zoom: 13.5,
      pitch: 49,
      bearing: -12,
      antialias: true,
      attributionControl: false,
      preserveDrawingBuffer: false
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.dragRotate.enable();
    map.touchZoomRotate.enable();

    const onStyleLoad = () => {
      // Style switches destroy custom sources/layers, so reconstruct the selection.
      map.addSource('selection-circle', { type: 'geojson', data: empty() });
      map.addSource('selection-square', { type: 'geojson', data: empty() });
      map.addLayer({ id: 'selection-fill', type: 'fill', source: 'selection-circle',
        paint: { 'fill-color': '#9be18a', 'fill-opacity': 0.21 } });
      map.addLayer({ id: 'selection-outline', type: 'line', source: 'selection-circle',
        paint: { 'line-color': '#cdf9a9', 'line-width': 2.7, 'line-opacity': .99 } });
      map.addLayer({ id: 'selection-square-line', type: 'line', source: 'selection-square',
        paint: { 'line-color': '#fffdfa', 'line-width': 1.8, 'line-opacity': .94, 'line-dasharray': [2.2, 1.6] } });
      setStyleVersion(v => v + 1);
    };
    map.on('style.load', onStyleLoad);
    map.on('click', event => {
      onSelectRef.current([event.lngLat.lng, event.lngLat.lat]);
    });
    map.on('load', () => onReadyRef.current?.(map));
    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      onReadyRef.current?.(null);
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      const nextStyle = BASE_STYLES[styleId].url;
      // map.getStyle().sprite is not used as a style ID; avoid redundant reloads via a ref below.
      if (mapStyleRef.current !== styleId) {
        mapStyleRef.current = styleId;
        map.setStyle(nextStyle);
      }
    }
  }, [styleId, styleVersion]);

  const mapStyleRef = useRef<MapStyleId>('satellite');

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const circleSource = map.getSource('selection-circle') as mapboxgl.GeoJSONSource | undefined;
    const squareSource = map.getSource('selection-square') as mapboxgl.GeoJSONSource | undefined;
    if (!circleSource || !squareSource) return;
    let circ: GeoJSON.FeatureCollection = empty();
    let square: GeoJSON.FeatureCollection = empty();
    if (selection) {
      try {
        circ = { type: 'FeatureCollection', features: [circlePolygon(selection, radius) as Feature<Polygon>] };
        if (showBounds) square = { type: 'FeatureCollection', features: [squarePolygon(boundingSquare(selection, radius)) as Feature<Polygon>] };
      } catch { /* Antimeridian or invalid coordinate: keep selection only. */ }
    }
    circleSource.setData(circ);
    squareSource.setData(square);
    if (selection) {
      if (!markerRef.current) {
        const markerElement = document.createElement('div');
        markerElement.className = 'map-pin';
        markerElement.setAttribute('aria-label', 'Drag selected location');
        markerElement.innerHTML = `<span class="map-pin-inner"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-4.7 7-11a7 7 0 1 0-14 0c0 6.3 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span>`;
        markerElement.addEventListener('click', event => event.stopPropagation());
        const marker = new mapboxgl.Marker({ element: markerElement, draggable: true, anchor: 'bottom' }).setLngLat(selection).addTo(map);
        marker.on('dragend', () => {
          const p = marker.getLngLat();
          onSelectRef.current([p.lng, p.lat]);
        });
        markerRef.current = marker;
      } else {
        markerRef.current.setLngLat(selection);
      }
    } else {
      markerRef.current?.remove();
      markerRef.current = null;
    }
  }, [selection, radius, showBounds, styleVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (const id of LAYER_IDS) {
      const name = `nasa-${id}`;
      const source = `nasa-source-${id}`;
      const status = layerStatuses.find(s => s.id === id);
      const shouldShow = enabledLayers.includes(id) && Boolean(status?.available && status.date);
      const previous = layerDateRef.current[id];
      if (map.getLayer(name) && (!shouldShow || previous !== status?.date)) map.removeLayer(name);
      if (map.getSource(source) && (!shouldShow || previous !== status?.date)) map.removeSource(source);
      if (shouldShow && status?.date && !map.getSource(source)) {
        map.addSource(source, {
          type: 'raster', tiles: [nasaWmsTileUrl(DATA_LAYERS[id].nasaId, status.date)],
          tileSize: 256, attribution: 'NASA Earthdata GIBS'
        });
        map.addLayer({ id: name, type: 'raster', source,
          paint: { 'raster-opacity': DATA_LAYERS[id].opacity, 'raster-fade-duration': 150 } }, 'selection-fill');
        layerDateRef.current[id] = status.date;
      }
    }
  }, [enabledLayers, layerStatuses, styleVersion]);

  const layerDateRef = useRef<Partial<Record<LayerId, string>>>({});

  useEffect(() => {
    if (!focus) return;
    mapRef.current?.flyTo({ center: focus.coords, zoom: Math.max(mapRef.current.getZoom(), 13.6), speed: 1.2, essential: true });
  }, [focus]);

  return <div ref={container} className="absolute inset-0" aria-label="Interactive Mapbox map. Click to select a field location." />;
}
