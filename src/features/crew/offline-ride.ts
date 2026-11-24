import { readSegments, type TrackPoint, type TrackStop } from './tracks';

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}

function download(title: string, extension: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = (title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || 'parcours') + extension;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadRideGpx(title: string, segments: TrackPoint[][], stops: TrackStop[]) {
  const waypoints = stops.map(({ point: [lat, lng], label }) => '<wpt lat="' + lat + '" lon="' + lng + '"><name>' + escapeXml(label) + '</name></wpt>').join('');
  const track = segments.map(segment => '<trkseg>' + segment.map(([lat, lng]) =>
    '<trkpt lat="' + lat + '" lon="' + lng + '"/>').join('') + '</trkseg>').join('');
  download(title, '.gpx', 'application/gpx+xml', '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="MYbike" xmlns="http://www.topografix.com/GPX/1/1">' +
    waypoints + '<trk><name>' + escapeXml(title) + '</name>' + track + '</trk></gpx>');
}

async function nearbyRoads(bounds: number[]) {
  const [south, west, north, east] = bounds as [number, number, number, number];
  if (north - south > 0.16 || east - west > 0.2 || south < -90 || north > 90 || west < -180 || east > 180) return [];
  const box = bounds.map(value => value.toFixed(5)).join(',');
  const data = '[out:json][timeout:7];way["highway"~"^(primary|secondary|tertiary|residential|unclassified|track|path|service)$"](' +
    box + ');out geom(' + box + ') 1200;';
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://ovp.dresel.systems/api/interpreter?' + new URLSearchParams({ data }), { signal: controller.signal });
    if (!response.ok) return [];
    const result = await response.json() as { elements?: { geometry?: ({ lat: number; lon: number } | null)[] }[] };
    return (result.elements ?? []).slice(0, 1200).flatMap(item => {
      const parts: TrackPoint[][] = [[]];
      for (const point of item.geometry ?? []) {
        if (point) parts[parts.length - 1]!.push([point.lat, point.lon]);
        else if (parts[parts.length - 1]!.length) parts.push([]);
      }
      return readSegments(parts).filter(part => part.length > 1);
    });
  } catch { return []; }
  finally { window.clearTimeout(timer); }
}

export async function downloadRideMap(title: string, segments: TrackPoint[][], stops: TrackStop[]) {
  const points = segments.flat();
  if (!points.length) return false;
  const lats = points.map(point => point[0]);
  const lngs = points.map(point => point[1]);
  const south = Math.min(...lats) - 0.004;
  const north = Math.max(...lats) + 0.004;
  const west = Math.min(...lngs) - 0.004;
  const east = Math.max(...lngs) + 0.004;
  const roads = await nearbyRoads([south, west, north, east]);
  const factor = Math.max(0.02, Math.cos((south + north) * Math.PI / 360));
  const scale = Math.min(620 / ((east - west) * factor), 640 / (north - south));
  const width = (east - west) * factor * scale + 40;
  const height = (north - south) * scale + 40;
  const xy = ([lat, lng]: TrackPoint) => [20 + (lng - west) * factor * scale, 20 + (north - lat) * scale];
  const lines = (paths: TrackPoint[][]) => paths.filter(path => path.length > 1)
    .map(path => '<polyline points="' + path.map(point => xy(point).map(value => value.toFixed(2)).join(',')).join(' ') + '"/>').join('');
  const pins = [{ point: points[0]!, label: 'Départ' }, ...stops, { point: points[points.length - 1]!, label: 'Arrivée' }]
    .map(({ point, label }) => {
      const [x, y] = xy(point);
      return '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#115b91"/><text x="' + (x! + 6) + '" y="' + (y! - 6) + '">' + escapeXml(label) + '</text>';
    }).join('');
  const footer = roads.length ? 'Fond de zone partiel · © OpenStreetMap contributors · ODbL · osm.org/copyright' : 'Trace et repères MYbike';
  const svgWidth = Math.max(width, 480);
  download(title, '-carte.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + svgWidth + ' ' + (height + 65) +
    '"><rect width="100%" height="100%" fill="#f3f7f5"/><text x="12" y="22" font-family="sans-serif" font-size="15">' + escapeXml(title) +
    '</text><defs><clipPath id="map"><rect width="' + width + '" height="' + height + '"/></clipPath></defs>' +
    '<g transform="translate(0 35)"><g clip-path="url(#map)" fill="none" stroke="#98a5ad" stroke-width="1">' + lines(roads) +
    '</g><g fill="none" stroke="#c82740" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">' + lines(segments) +
    '</g><g font-family="sans-serif" font-size="10" fill="#10344a">' + pins + '</g></g><text x="12" y="' + (height + 55) +
    '" font-family="sans-serif" font-size="10">' + footer + '</text></svg>');
  return roads.some(path => path.length > 1);
}
