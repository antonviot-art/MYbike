import { metersBetween, type TrackPoint } from './tracks';
import { parseGpxDocument, parseTrackFix } from './gpx-track';

export type LapSample = [number, number, number];
export type LapTrace = LapSample[];
type Fix = { point: TrackPoint; time: number };

export function calculateGpxLaps(text: string, route: TrackPoint[]) {
  const xml = parseGpxDocument(text);
  const start = route[0];
  if (!start || route.length < 4) throw new Error('La boucle ne contient pas assez de points.');
  const checkpoints = [0.25, 0.5, 0.75].map(fraction => route[Math.floor((route.length - 1) * fraction)]!);
  const laps: number[] = [];
  const lapTraces: LapTrace[] = [];
  let hasTimedPoints = false;

  for (const segment of Array.from(xml.getElementsByTagNameNS('*', 'trkseg'))) {
    let previous: Fix | undefined;
    let lapStart: number | undefined;
    let samples: LapTrace = [];
    let away = false;
    let checkpoint = 0;
    for (const node of Array.from(segment.getElementsByTagNameNS('*', 'trkpt'))) {
      const parsed = parseTrackFix(node);
      const fix = parsed && Number.isFinite(parsed.time) ? parsed : undefined;
      if (fix) hasTimedPoints = true;
      if (!fix || (previous && (fix.time <= previous.time || fix.time - previous.time > 15000))) {
        previous = undefined;
        lapStart = undefined;
        samples = [];
        away = false;
        checkpoint = 0;
      }
      if (!fix) continue;
      const distance = metersBetween(start, fix.point);
      if (distance >= 45 && lapStart !== undefined) away = true;
      const target = checkpoints[checkpoint];
      if (away && target && metersBetween(target, fix.point) <= 35) checkpoint++;

      if (distance <= 15 && (lapStart === undefined || away)) {
        const before = previous && metersBetween(start, previous.point);
        const crossing = previous && before !== undefined && before > 15 && fix.time - previous.time <= 3000
          ? previous.time + (fix.time - previous.time) * (before - 15) / (before - distance)
          : fix.time;
        if (lapStart !== undefined && checkpoint === checkpoints.length && crossing - lapStart >= 12000) {
          const duration = Math.round(crossing - lapStart);
          laps.push(duration);
          lapTraces.push([...samples.filter(sample => sample[2] < duration), [...fix.point, duration]]);
        }
        lapStart = crossing;
        samples = [[...fix.point, 0]];
        away = false;
        checkpoint = 0;
      } else if (lapStart !== undefined && samples.length < 1199) {
        samples.push([...fix.point, Math.round(fix.time - lapStart)]);
      }
      previous = fix;
    }
  }

  if (!hasTimedPoints) throw new Error('Ce GPX ne contient pas de points GPS horodatés.');
  if (!laps.length) throw new Error('Aucun tour complet détecté. Lance la trace avant la ligne et arrête-la après ton dernier passage.');
  return { laps, lapTraces };
}
