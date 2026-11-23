export type TrackPoint = [number, number];
export type Track = { segments: TrackPoint[][]; distance: number; duration: number };

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
