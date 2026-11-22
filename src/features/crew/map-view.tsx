import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Marker = { lat: number; lng: number; label: string; live?: boolean };

export default function MapView({ points, markers, focus, onPoint }: {
  points: [number, number][];
  markers: Marker[];
  focus: number;
  onPoint: (lat: number, lng: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>(null);
  const layer = useRef<L.LayerGroup>(null);
  const callback = useRef(onPoint);
  callback.current = onPoint;
  const currentMarkers = useRef(markers);
  currentMarkers.current = markers;

  useEffect(() => {
    if (!el.current) return;
    const instance = L.map(el.current).setView([48.067, 6.862], 12);
    map.current = instance;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(instance);
    layer.current = L.layerGroup().addTo(instance);
    instance.on('click', event => callback.current(event.latlng.lat, event.latlng.lng));
    return () => { instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const group = layer.current;
    if (!group) return;
    group.clearLayers();
    const styles = getComputedStyle(document.documentElement);
    const color = styles.getPropertyValue('--primary').trim();
    const liveColor = styles.getPropertyValue('--success').trim();
    for (const marker of markers) {
      if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) continue;
      const label = document.createElement('span');
      label.textContent = marker.label;
      const options = { radius: 8, color: marker.live ? liveColor : color, fillOpacity: 0.7, weight: 3 };
      L.circleMarker([marker.lat, marker.lng], options).bindPopup(label).addTo(group);
    }
    if (points.length > 1) L.polyline(points, { color, weight: 4 }).addTo(group);
  }, [points, markers]);

  useEffect(() => {
    if (points.length > 1) map.current?.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
  }, [points]);

  useEffect(() => {
    if (!focus) return;
    const list = currentMarkers.current.filter(marker => marker.live && Number.isFinite(marker.lat) && Number.isFinite(marker.lng));
    if (list.length) map.current?.fitBounds(L.latLngBounds(list.map(marker => [marker.lat, marker.lng])), { padding: [50, 50], maxZoom: 14 });
  }, [focus]);

  return <div ref={el} className="map-canvas" aria-label="Carte interactive des sorties" />;
}
