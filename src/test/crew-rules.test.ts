import {describe,it,expect} from 'vitest';
import {demoRecords, validCounter, readGpx} from '@/features/crew/data';
describe('Group foundation',()=>{
 it('has exactly three example riders with two motorcycles and one quad',()=>{const vehicles=demoRecords.filter(r=>r.kind==='vehicle');expect(vehicles).toHaveLength(3);expect(new Set(vehicles.map(r=>r.payload['owner'])).size).toBe(3);expect(vehicles.filter(r=>r.payload['type']==='Enduro')).toHaveLength(2);expect(vehicles.filter(r=>r.payload['type']==='Quad')).toHaveLength(1)});
 it('accepts nonnegative hours and kilometer counters',()=>{expect(validCounter(124.5)).toBe(true);expect(validCounter(0)).toBe(true);expect(validCounter(-1)).toBe(false);expect(validCounter(NaN)).toBe(false)});
 it('imports track coordinates from a GPX file',()=>{expect(readGpx('<gpx><trk><trkseg><trkpt lat="48.065" lon="6.863"/><trkpt lat="48.07" lon="6.87"/></trkseg></trk></gpx>')).toEqual([[48.065,6.863],[48.07,6.87]])});
 it('rejects empty GPX tracks',()=>{expect(()=>readGpx('<gpx/>')).toThrow()});
});
