import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useTrackRecorder } from '@/features/crew/use-track-recorder';
import { createRideSpeed } from '@/features/crew/ride-speed';

it('uses the device speed and shows zero immediately when it reports a stop', () => {
  const estimate = createRideSpeed();
  const fix = { point: [48, 4.5] as [number, number], accuracy: 9 };
  expect(estimate({ ...fix, timestamp: 1000, reported: 10 })).toEqual({ kmh: 36, source: 'gps' });
  expect(estimate({ ...fix, timestamp: 2000, reported: 0 })).toEqual({ kmh: 0, source: 'gps' });
});

it('avoids displaying a speed from GPS drift and estimates sustained displacement', () => {
  const estimate = createRideSpeed();
  const fix = (timestamp: number, latitude: number) => estimate({
    point: [latitude, 4.5], timestamp, accuracy: 9, reported: null,
  });
  expect(fix(1000, 48)).toBeUndefined();
  expect(fix(3000, 48.00005)).toBeUndefined();
  expect(fix(6000, 48.00005)).toBeUndefined();
  const moving = fix(9000, 48.001);
  expect(moving?.source).toBe('estimate');
  expect(moving?.kmh).toBeCloseTo(50.04, 1);
});

it('keeps a GPS draft, rejects weak fixes and does not connect gaps in reception', () => {
  let onPosition: PositionCallback = () => {};
  const clearWatch = vi.fn();
  const geolocation = {
    watchPosition: (callback: PositionCallback) => { onPosition = callback; return 8; },
    clearWatch,
  };
  const navigatorSpy = vi.spyOn(window, 'navigator', 'get').mockReturnValue({ geolocation } as unknown as Navigator);
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  const key = 'mybike:test-track';
  try {
    const first = renderHook(() => useTrackRecorder(key));
    act(() => first.result.current.start());
    const fix = (time: number, lat: number, accuracy: number, speed: number | null = null) => act(() => onPosition({
      timestamp: time, coords: { latitude: lat, longitude: 4.5, accuracy, speed },
    } as GeolocationPosition));
    fix(10000, 48, 8, 10);
    expect(first.result.current.speed).toBe(36);
    expect(first.result.current.position).toEqual({ point: [48, 4.5], accuracy: 8 });
    fix(15000, 49, 120);
    expect(first.result.current.speed).toBeUndefined();
    fix(20000, 48.001, 8);
    expect(first.result.current.speed).toBeCloseTo(40.03, 1);
    fix(65000, 48.005, 8);
    act(() => first.result.current.stop());
    expect(clearWatch).toHaveBeenCalledWith(8);
    expect(first.result.current.segments).toEqual([[[48, 4.5], [48.001, 4.5]], [[48.005, 4.5]]]);
    expect(first.result.current.distance).toBeCloseTo(111.195, 1);
    first.unmount();

    const resumed = renderHook(() => useTrackRecorder(key));
    expect(resumed.result.current.segments).toHaveLength(2);
    expect(resumed.result.current.recording).toBe(false);
    resumed.unmount();
  } finally {
    navigatorSpy.mockRestore();
    vi.unstubAllGlobals();
  }
});
