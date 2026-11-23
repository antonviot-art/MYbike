import type { TrackPoint } from './tracks';

type Fix = { point: TrackPoint; timestamp: number; accuracy: number; reported: number | null | undefined };
export type SpeedReading = { kmh: number; source: 'gps' | 'estimate' };

const maxSpeed = 70; // m/s
const windowMs = 11000;
const metersPerDegree = Math.PI * 6371000 / 180;

function median(values: number[]) {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
}

function movement(fixes: Fix[]): number | undefined {
  const first = fixes[0];
  const last = fixes.at(-1);
  if (!first || !last || last.timestamp - first.timestamp < 4000) return undefined;
  const north: number[] = [];
  const east: number[] = [];
  for (const [index, from] of fixes.entries()) {
    for (const to of fixes.slice(index + 1)) {
      const seconds = (to.timestamp - from.timestamp) / 1000;
      if (seconds < 2.5) continue;
      const deltaLon = ((to.point[1] - from.point[1] + 540) % 360) - 180;
      const latitude = (to.point[0] + from.point[0]) * Math.PI / 360;
      const vertical = (to.point[0] - from.point[0]) * metersPerDegree / seconds;
      const horizontal = deltaLon * Math.cos(latitude) * metersPerDegree / seconds;
      if (Math.hypot(vertical, horizontal) > maxSpeed) continue;
      north.push(vertical);
      east.push(horizontal);
    }
  }
  if (north.length === 0) return undefined;
  const speed = Math.hypot(median(north), median(east));
  const elapsed = (last.timestamp - first.timestamp) / 1000;
  const typicalAccuracy = median(fixes.map(fix => fix.accuracy));
  const uncertainty = Math.max(3, Math.SQRT2 * typicalAccuracy);
  if (speed * elapsed > uncertainty) return speed;
  return typicalAccuracy <= 5 && elapsed >= 6 ? 0 : undefined;
}

export function createRideSpeed() {
  let fixes: Fix[] = [];
  let latest = -Infinity;
  let previous: { speed: number; time: number; source: SpeedReading['source'] } | undefined;
  let pendingJump: number | undefined;

  function reading(speed: number, time: number, source: SpeedReading['source']): SpeedReading {
    if (previous && previous.source === source && previous.speed > 0 && speed > 0) {
      const elapsed = (time - previous.time) / 1000;
      const alpha = 1 - Math.exp(-elapsed / (source === 'gps' ? 0.4 : 0.85));
      speed = previous.speed + (speed - previous.speed) * alpha;
    }
    previous = { speed, time, source };
    return { kmh: speed * 3.6, source };
  }

  return (fix: Fix): SpeedReading | undefined => {
    if (fix.timestamp <= latest) return undefined;
    if (fix.timestamp - latest > windowMs) {
      fixes = [];
      previous = undefined;
      pendingJump = undefined;
    }
    latest = fix.timestamp;
    fixes = fixes.filter(sample => fix.timestamp - sample.timestamp <= windowMs);
    if (!Number.isFinite(fix.accuracy) || fix.accuracy > 35) {
      previous = undefined;
      pendingJump = undefined;
      return undefined;
    }

    const newest = fixes.at(-1);
    if (fix.accuracy <= 20) {
      if (!newest || fix.timestamp - newest.timestamp >= 500) fixes.push(fix);
      else if (fix.accuracy <= newest.accuracy) fixes[fixes.length - 1] = fix;
    }
    if (fix.reported != null && Number.isFinite(fix.reported) && fix.reported >= 0 && fix.reported <= maxSpeed) {
      if (fix.reported > 0 && previous?.source === 'gps') {
        const elapsed = (fix.timestamp - previous.time) / 1000;
        const jump = Math.abs(fix.reported - previous.speed) > 3 + elapsed * 10;
        if (jump && (pendingJump === undefined || Math.abs(fix.reported - pendingJump) > 4)) {
          pendingJump = fix.reported;
          return { kmh: previous.speed * 3.6, source: 'gps' };
        }
      }
      pendingJump = undefined;
      return reading(fix.reported, fix.timestamp, 'gps');
    }
    pendingJump = undefined;
    const speed = fix.accuracy <= 20 ? movement(fixes) : undefined;
    if (speed === undefined) {
      previous = undefined;
      return undefined;
    }
    return reading(speed, fix.timestamp, 'estimate');
  };
}
