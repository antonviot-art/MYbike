import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useTrackRecorder } from '@/features/crew/use-track-recorder';

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
