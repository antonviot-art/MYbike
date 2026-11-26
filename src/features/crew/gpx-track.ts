import type { TrackPoint } from './tracks';

export function parseGpxDocument(text: string) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.documentElement.localName !== 'gpx' || xml.getElementsByTagNameNS('*', 'parsererror').length) {
    throw new Error('Choisis un fichier GPX valide.');
  }
  return xml;
}

export function parseTrackFix(node: Element) {
  const lat = node.getAttribute('lat');
  const lon = node.getAttribute('lon');
  const point: TrackPoint = [Number(lat), Number(lon)];
  if (!lat?.trim() || !lon?.trim() || !point.every(Number.isFinite) ||
      Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) return;
  const time = Date.parse(node.getElementsByTagNameNS('*', 'time')[0]?.textContent ?? '');
  return { point, time };
}

export function readGpxTrack(text: string, maxPoints: number) {
  const xml = parseGpxDocument(text);
  const segments: TrackPoint[][] = [];
  let duration = 0;
  let count = 0;
  for (const segment of Array.from(xml.getElementsByTagNameNS('*', 'trkseg'))) {
    const points: TrackPoint[] = [];
    let firstTime: number | undefined;
    let lastTime: number | undefined;
    for (const node of Array.from(segment.getElementsByTagNameNS('*', 'trkpt'))) {
      const fix = parseTrackFix(node);
      if (!fix) continue;
      if (++count > maxPoints) throw new Error(`Ce GPX dépasse la limite de ${maxPoints.toLocaleString('fr-FR')} points.`);
      points.push(fix.point);
      if (Number.isFinite(fix.time)) {
        firstTime ??= fix.time;
        lastTime = fix.time;
      }
    }
    if (points.length < 2) continue;
    segments.push(points);
    if (firstTime !== undefined && lastTime !== undefined) duration += Math.max(0, lastTime - firstTime);
  }
  if (!segments.length) throw new Error('Le GPX doit contenir une trace d’au moins deux points.');
  return { segments, duration };
}
