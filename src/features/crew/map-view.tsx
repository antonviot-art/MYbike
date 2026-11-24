import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCrew } from './context';

const pinIcons = {
  rasso: '⚑', event: '▦', fuel: '⛽', charging: 'ϟ', parking: 'P', other: '📍',
};

type Marker = { lat: number; lng: number; label: string; live?: boolean; current?: boolean; accuracy?: number; showName?: boolean; url?: string; color?: string; category?: string; onRemove?: (() => void) | undefined };

export default function MapView({ points, segments, markers, focus, focusGroup = false, follow = false, onPoint, onCenter }: {
  points: [number, number][];
  segments?: [number, number][][];
  markers: Marker[];
  focus: number;
  focusGroup?: boolean;
  follow?: boolean;
  onPoint: (lat: number, lng: number) => void;
  onCenter?: (lat: number, lng: number, zoom: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const { aerial } = useCrew();
  const map = useRef<L.Map>(null);
  const layer = useRef<L.LayerGroup>(null);
  const callback = useRef(onPoint);
  callback.current = onPoint;
  const centerCallback = useRef(onCenter);
  centerCallback.current = onCenter;
  const currentMarkers = useRef(markers);
  currentMarkers.current = markers;
  const followed = follow ? markers.find(marker => marker.current) : undefined;
  const followLat = followed?.lat;
  const followLng = followed?.lng;

  useEffect(() => {
    if (!el.current) return;
    const instance = L.map(el.current).setView([48.067, 6.862], 12);
    map.current = instance;
    layer.current = L.layerGroup().addTo(instance);
    instance.on('click', event => callback.current(event.latlng.lat, event.latlng.lng));
    instance.on('moveend', () => {
      const center = instance.getCenter().wrap();
      centerCallback.current?.(center.lat, center.lng, instance.getZoom());
    });
    const resize = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
    resize.observe(el.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const url = aerial
      ? 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image%2Fjpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
      : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const tiles = L.tileLayer(url, {
      attribution: aerial ? 'Vue aérienne © IGN · © OpenStreetMap contributors' : '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(instance);
    if (aerial) tiles.on('tileerror', (event: L.TileErrorEvent) => {
      const image = event.tile as HTMLImageElement;
      if (image.src.includes('openstreetmap.org')) return;
      const { x, y, z } = event.coords;
      image.src = 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
    });
    return () => { tiles.remove(); };
  }, [aerial]);

  useEffect(() => {
    const group = layer.current;
    if (!group) return;
    group.clearLayers();
    const styles = getComputedStyle(document.documentElement);
    const color = styles.getPropertyValue('--primary').trim();
    for (const marker of markers) {
      if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) continue;
      const label = marker.url ? document.createElement('a') : document.createElement('span');
      if (label instanceof HTMLAnchorElement && marker.url?.startsWith('/rasso?')) label.href = marker.url;
      label.textContent = marker.label;
      if (marker.current) {
        const center: L.LatLngTuple = [marker.lat, marker.lng];
        if (marker.accuracy) L.circle(center, { radius: Math.min(150, marker.accuracy), color: '#22c55e', weight: 1, fillOpacity: 0.16 }).addTo(group);
        L.circleMarker(center, { radius: 8, color: 'white', fillColor: '#16a34a', fillOpacity: 1, weight: 3 }).bindPopup(label).addTo(group);
        continue;
      }
      if (!marker.live) {
        const popup = document.createElement('div');
        popup.append(label);
        if (marker.onRemove) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'map-pin-remove';
          button.textContent = 'Supprimer le repère';
          button.addEventListener('click', marker.onRemove);
          popup.append(button);
        }
        const icon = document.createElement('span');
        icon.className = 'map-pin-icon';
        icon.style.backgroundColor = marker.color ?? color;
        const category = marker.category as keyof typeof pinIcons;
        icon.textContent = Object.hasOwn(pinIcons, category) ? pinIcons[category] : pinIcons.other;
        L.marker([marker.lat, marker.lng], {
          title: marker.label,
          alt: marker.label,
          icon: L.divIcon({ className: 'map-pin', html: icon, iconSize: [28, 34], iconAnchor: [14, 34], popupAnchor: [0, -32] }),
        }).bindPopup(popup).addTo(group);
        continue;
      }
      const options = { radius: 7, color: 'white', fillColor: '#2563eb', fillOpacity: 1, weight: 2 };
      const dot = L.circleMarker([marker.lat, marker.lng], options).bindPopup(label).addTo(group);
      if (marker.showName) dot.bindTooltip(label.cloneNode(true) as HTMLElement, { direction: 'top', offset: [0, -8], permanent: true });
    }
    if (segments?.length) L.polyline(segments, { color, weight: 4 }).addTo(group);
    else if (points.length > 1) L.polyline(points, { color, weight: 4 }).addTo(group);
  }, [points, segments, markers]);

  useEffect(() => {
    if (focusGroup) return;
    const positions = segments?.flat() ?? points;
    if (positions.length) map.current?.fitBounds(L.latLngBounds(positions), { padding: [30, 30], maxZoom: 16 });
  }, [points, segments, follow, focusGroup]);

  useEffect(() => {
    if (followLat === undefined || followLng === undefined) return;
    map.current?.panTo([followLat, followLng], { animate: false });
  }, [followLat, followLng]);

  useEffect(() => {
    if (!focus) return;
    const list = currentMarkers.current.filter(marker => marker.live && Number.isFinite(marker.lat) && Number.isFinite(marker.lng));
    const current = list.find(marker => marker.current);
    const group = current && !focusGroup ? [current] : list;
    if (group.length) map.current?.fitBounds(L.latLngBounds(group.map(marker => [marker.lat, marker.lng])), { padding: [50, 50], maxZoom: 14 });
  }, [focus, focusGroup]);

  return <div ref={el} className="map-canvas" aria-label="Carte interactive des sorties" />;
}
