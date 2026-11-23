import type { TrackPoint } from './tracks';

export async function photoGps(file: File): Promise<TrackPoint | undefined> {
  try {
    const bytes = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (bytes.getUint16(0) !== 0xffd8) return;
    for (let offset = 2; offset + 4 < bytes.byteLength;) {
      const marker = bytes.getUint16(offset);
      if (marker === 0xffda || marker === 0xffd9 || (marker >> 8) !== 0xff) return;
      const size = bytes.getUint16(offset + 2);
      if (size < 2 || offset + 2 + size > bytes.byteLength) return;
      if (marker === 0xffe1 && size >= 16 && bytes.getUint32(offset + 4) === 0x45786966 && bytes.getUint16(offset + 8) === 0) {
        return gpsFromTiff(new DataView(bytes.buffer, offset + 10, size - 8));
      }
      offset += 2 + size;
    }
  } catch { /* Damaged or unsupported metadata. */ }
  return undefined;
}

function gpsFromTiff(data: DataView): TrackPoint | undefined {
  const order = data.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return;
  const little = order === 0x4949;
  const word = (offset: number) => data.getUint16(offset, little);
  const long = (offset: number) => data.getUint32(offset, little);
  if (word(2) !== 42) return;
  function entry(directory: number, tag: number) {
    const count = word(directory);
    if (directory + 2 + count * 12 > data.byteLength) return;
    for (let index = 0; index < count; index++) {
      const field = directory + 2 + 12 * index;
      if (word(field) === tag) return field;
    }
    return undefined;
  }
  const pointer = entry(long(4), 0x8825);
  if (pointer === undefined || word(pointer + 2) !== 4 || long(pointer + 4) !== 1) return;
  const directory = long(pointer + 8);
  function angle(valueTag: number, refTag: number, positive: string, negative: string) {
    const value = entry(directory, valueTag);
    const ref = entry(directory, refTag);
    if (value === undefined || ref === undefined || word(value + 2) !== 5 || long(value + 4) !== 3 ||
        word(ref + 2) !== 2 || long(ref + 4) !== 2) return NaN;
    const start = long(value + 8);
    const quadrant = String.fromCharCode(data.getUint8(ref + 8));
    const rational = (index: number) => long(start + index * 8) / long(start + index * 8 + 4);
    const sign = quadrant === positive ? 1 : quadrant === negative ? -1 : NaN;
    return sign * (rational(0) + rational(1) / 60 + rational(2) / 3600);
  }
  const lat = angle(2, 1, 'N', 'S');
  const lng = angle(4, 3, 'E', 'W');
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng];
  return undefined;
}
