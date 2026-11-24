import { maxValhallaStops, metersBetween, readSegments, type TrackPoint } from './tracks';

const profiles = {
  road: { use_trails: 0, use_tracks: 0, use_highways: 0.5 },
  mixed: { use_trails: 0.5, use_tracks: 0.5, use_highways: 0.2 },
  trails: { use_trails: 1, use_tracks: 1, use_highways: 0 },
} as const;

export type RoutePreference = keyof typeof profiles;
export type RouteManeuver = { instruction: string; type: number; index: number };
export type SuggestedRide = { points: TrackPoint[]; km: number; seconds: number; directions: string[]; maneuvers: RouteManeuver[]; snappedStops: TrackPoint[] };

const cache = new Map<string, { expires: number; route: SuggestedRide }>();
let lastRequest = 0;
let running = false;

function decodeShape(shape: string): TrackPoint[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const points: TrackPoint[] = [];
  function delta() {
    let value = 0;
    let shift = 0;
    while (index < shape.length && shift < 30) {
      const byte = shape.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) break;
      value |= (byte & 31) << shift;
      if (byte < 32) return (value & 1) ? ~(value >> 1) : value >> 1;
      shift += 5;
    }
    throw new Error('Invalid route shape');
  }
  while (index < shape.length) {
    lat += delta();
    lng += delta();
    points.push([lat / 1e6, lng / 1e6]);
  }
  return points;
}

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function routingResponse(request: Request) {
  if (process.env['VALHALLA_DEMO_ENABLED'] === 'false') return reply({ error: 'disabled' }, 503);
  if (request.method !== 'POST') return reply({ error: 'method' }, 405);
  const origin = request.headers.get('origin');
  if (origin !== 'https://mybikee.onrender.com' && origin !== new URL(request.url).origin) return reply({ error: 'origin' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'input' }, 400);

  let input: { start?: unknown; end?: unknown; preference?: unknown; via?: unknown; strictEnd?: unknown };
  try {
    const body = await request.text();
    if (body.length > 4096) return reply({ error: 'input' }, 400);
    input = JSON.parse(body);
    if (!input || typeof input !== 'object') return reply({ error: 'input' }, 400);
  } catch { return reply({ error: 'input' }, 400); }
  const via = input.via ?? [];
  if (!Array.isArray(via) || via.length > maxValhallaStops - 2) return reply({ error: 'input' }, 400);
  const [locations] = readSegments([[input.start, ...via, input.end]]);
  const preference = input.preference as RoutePreference;
  if (!locations || !Object.hasOwn(profiles, preference)) return reply({ error: 'input' }, 400);
  const key = JSON.stringify([preference, input.strictEnd === true, locations.map(point => point.map(value => Number(value.toFixed(5))))]);
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return reply(entry.route);
  if (running || Date.now() - lastRequest < 1200) return reply({ error: 'busy' }, 429);
  const passageTolerance = 250;
  lastRequest = Date.now();
  running = true;

  try {
    const response = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'mybikee.onrender.com' },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        locations: locations.map(([lat, lon]) => ({ lat, lon, type: 'break',
          radius: 0, search_cutoff: passageTolerance, rank_candidates: true,
        })),
        costing: 'motorcycle', costing_options: { motorcycle: profiles[preference] },
        units: 'km', language: 'fr-FR',
      }),
    });
    if (response.status === 429) return reply({ error: 'busy' }, 429);
    if (response.status === 400 || response.status === 404) return reply({ error: via.length ? 'unreachable-via' : 'no-route' }, 404);
    if (!response.ok) return reply({ error: 'unavailable' }, 502);
    const result = await response.json() as { trip?: {
      summary?: { length: number; time: number };
      legs?: { shape: string; maneuvers?: { instruction: string; type: number; begin_shape_index: number }[] }[];
    }};
    const summary = result.trip?.summary;
    const legs = result.trip?.legs;
    if (!summary || !legs?.length || !Number.isFinite(summary.length) || !Number.isFinite(summary.time)) {
      return reply({ error: 'no-route' }, 404);
    }
    const shapes = legs.map(leg => decodeShape(leg.shape));
    if (via.length && (shapes.length !== locations.length - 1 || locations.slice(1, -1).some((location, index) => {
      const arrival = shapes[index]?.at(-1);
      return !arrival || metersBetween(location, arrival) > passageTolerance;
    }))) return reply({ error: 'unreachable-via' }, 404);
    if (input.strictEnd === true) {
      const arrival = shapes.at(-1)?.at(-1);
      if (!arrival || metersBetween(locations[locations.length - 1]!, arrival) > passageTolerance) return reply({ error: 'unreachable-via' }, 404);
    }
    let pointOffset = 0;
    const maneuvers = legs.flatMap((leg, legIndex) => {
      const shape = shapes[legIndex]!;
      const offset = pointOffset;
      pointOffset += shape.length - 1;
      return (leg.maneuvers ?? []).flatMap(step => Number.isInteger(step.begin_shape_index) && shape[step.begin_shape_index]
        ? [{ instruction: step.instruction, type: step.type, index: offset + step.begin_shape_index }] : []);
    });
    const route: SuggestedRide = {
      points: shapes.flatMap((shape, index) => index ? shape.slice(1) : shape),
      km: summary.length, seconds: summary.time,
      snappedStops: shapes.flatMap(shape => { const arrival = shape.at(-1); return arrival ? [arrival] : []; }),
      maneuvers,
      directions: legs.flatMap(leg => (leg.maneuvers ?? []).map(step => step.instruction)),
    };
    if (route.points.length < 2) return reply({ error: 'no-route' }, 404);
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 600000, route });
    return reply(route);
  } catch {
    return reply({ error: 'unavailable' }, 502);
  } finally { running = false; }
}
