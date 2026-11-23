import { metersBetween, type TrackPoint } from './tracks';

type Fix = { point: TrackPoint; timestamp: number; accuracy: number; reported: number | null | undefined };
export type SpeedReading = { kmh: number; source: 'gps' | 'estimate' };

const maxSpeed = 70; // m/s
const windowMs = 11000;

export function createRideSpeed() {
  let fixes: Fix[] = [];
  let latest = -Infinity;
  let previous: { speed: number; time: number; source: SpeedReading['source'] } | undefined;

  function reading(speed: number, time: number, source: SpeedReading['source']): SpeedReading {
    if (previous && previous.source === source && previous.speed > 0 && speed > 0) {
      const elapsed = (time - previous.time) / 1000;
      const alpha = 1 - Math.exp(-elapsed / (source === 'gps' ? 0.65 : 1.4));
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
    }
    latest = fix.timestamp;
    fixes = fixes.filter(sample => fix.timestamp - sample.timestamp <= windowMs);
    if (!Number.isFinite(fix.accuracy) || fix.accuracy > 35) {
      previous = undefined;
      return undefined;
    }
    const origin = fixes.find(sample => fix.timestamp - sample.timestamp >= 4000 &&
      sample.accuracy <= 20 && fix.accuracy <= 20);
    fixes.push(fix);
    if (fixes.length > 32) fixes.shift();

    if (fix.reported != null && Number.isFinite(fix.reported) && fix.reported >= 0 && fix.reported <= maxSpeed) {
      return reading(fix.reported, fix.timestamp, 'gps');
    }
    if (!origin) return undefined;

    const seconds = (fix.timestamp - origin.timestamp) / 1000;
    const distance = metersBetween(origin.point, fix.point);
    const noise = Math.max(3, Math.hypot(origin.accuracy, fix.accuracy));
    if (distance <= noise) {
      previous = undefined;
      return origin.accuracy <= 5 && fix.accuracy <= 5 && seconds >= 6
        ? reading(0, fix.timestamp, 'estimate') : undefined;
    }
    const speed = distance / seconds;
    if (speed > maxSpeed) {
      // Remove the implausible fix so it cannot contaminate the next measurement.
      fixes.pop();
      previous = undefined;
      return undefined;
    }
    return reading(speed, fix.timestamp, 'estimate');
  };
}
