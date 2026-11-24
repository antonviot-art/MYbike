export const maxValhallaStops = 10;

export type TrackPoint = [number, number];
export type TrackStop = { point: TrackPoint; label: string };

const radians = Math.PI / 180;

export function metersBetween(first: TrackPoint, second: TrackPoint) {
  const lat = (second[0] - first[0]) * radians;
  const lng = (second[1] - first[1]) * radians;
  const square = Math.sin(lat / 2) ** 2
    + Math.cos(first[0] * radians) * Math.cos(second[0] * radians) * Math.sin(lng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, square)));
}

export function trackDistance(segments: TrackPoint[][]) {
  return segments.reduce((sum, segment) => sum + segment.slice(1).reduce(
    (distance, point, index) => distance + metersBetween(segment[index]!, point), 0,
  ), 0);
}

export function readSegments(value: unknown): TrackPoint[][] {
  if (!Array.isArray(value)) return [];
  return value.filter((segment): segment is TrackPoint[] =>
    Array.isArray(segment) && segment.length > 0 && segment.every(point =>
      Array.isArray(point) && point.length === 2 &&
      Number.isFinite(point[0]) && Math.abs(point[0]) <= 90 &&
      Number.isFinite(point[1]) && Math.abs(point[1]) <= 180,
    ),
  );
}

export function kilometers(distance: number) {
  return (distance / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' km';
}

export function readStops(value: unknown): TrackStop[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item !== 'object' || !item || typeof item.label !== 'string' || !item.label.trim()) return [];
    const point = readSegments([[item.point]])[0]?.[0];
    return point ? [{ point, label: item.label.slice(0, 80) }] : [];
  }).slice(0, 80);
}

export function routeProgress(point: TrackPoint, segments: TrackPoint[][]) {
  const scale = Math.PI * 6371000 / 180;
  const xScale = scale * Math.cos(point[0] * radians);
  let nearest = Infinity;
  let traveled = 0;
  let total = 0;
  for (const segment of segments) {
    let last: TrackPoint | undefined;
    for (const [lat, lon] of segment) {
      const x = ((lon - point[1] + 540) % 360 - 180) * xScale;
      const y = (lat - point[0]) * scale;
      if (!last && Math.hypot(x, y) < nearest) { nearest = Math.hypot(x, y); traveled = total; }
      if (last) {
        const dx = x - last[0], dy = y - last[1];
        const squared = dx * dx + dy * dy;
        if (squared) {
          const ratio = Math.min(1, Math.max(0, -(last[0] * dx + last[1] * dy) / squared));
          const length = Math.sqrt(squared);
          const distance = Math.hypot(last[0] + ratio * dx, last[1] + ratio * dy);
          if (distance < nearest) { nearest = distance; traveled = total + ratio * length; }
          total += length;
        }
      }
      last = [x, y];
    }
  }
  return { distance: nearest, traveled, remaining: Math.max(0, total - traveled) };
}

export function metersFromRoute(point: TrackPoint, segments: TrackPoint[][]) {
  return routeProgress(point, segments).distance;
}
