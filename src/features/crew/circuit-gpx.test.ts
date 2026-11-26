import { describe, expect, it } from 'vitest';
import { calculateGpxLaps } from './circuit-gpx';
import { readGpxTrack } from './gpx-track';
import type { TrackPoint } from './tracks';

const circuit: TrackPoint[] = [[48, 5], [48, 5.001], [48.001, 5.001], [48.001, 5], [48, 5]];

function gpx(...segments: TrackPoint[][]) {
  let seconds = 0;
  return '<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk>' + segments.map(segment =>
    '<trkseg>' + segment.map(([lat, lon]) => {
      seconds += 5;
      return `<trkpt lat="${lat}" lon="${lon}"><time>${new Date(seconds * 1000).toISOString()}</time></trkpt>`;
    }).join('') + '</trkseg>',
  ).join('') + '</trk></gpx>';
}

describe('GPX de chronométrage', () => {
  it('calcule deux tours et ignore le dernier tour incomplet', () => {
    const result = calculateGpxLaps(gpx([...circuit, ...circuit.slice(1), circuit[1]!]), circuit);
    expect(result.laps).toEqual([20000, 20000]);
    expect(result.lapTraces.map(trace => trace.at(-1)?.[2])).toEqual(result.laps);
  });

  it('ignore les trajets qui reviennent au départ sans suivre la boucle', () => {
    expect(() => calculateGpxLaps(gpx([circuit[0]!, circuit[1]!, circuit[1]!, circuit[0]!]), circuit)).toThrow('Aucun tour complet');
  });

  it('ne raccorde pas les segments séparés', () => {
    expect(() => calculateGpxLaps(gpx(circuit.slice(0, 4), circuit.slice(4)), circuit)).toThrow('Aucun tour complet');
  });
});

describe('GPX de parcours', () => {
  it('conserve les segments séparés et additionne leurs durées', () => {
    const segments = [circuit.slice(0, 2), circuit.slice(2)];
    expect(readGpxTrack(gpx(...segments), 12)).toEqual({ segments, duration: 15000 });
  });

  it('rejette un GPX sans segment exploitable', () => {
    expect(() => readGpxTrack(gpx(circuit.slice(0, 1)), 12)).toThrow('au moins deux points');
  });
});
