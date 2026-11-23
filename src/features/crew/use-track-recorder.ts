import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { metersBetween, readSegments, trackDistance, type TrackPoint } from './tracks';

const maxPoints = 12000;

export function useTrackRecorder(key: string) {
  const [segments, setSegments] = useState<TrackPoint[][]>([]);
  const [duration, setDuration] = useState(0);
  const [recording, setRecording] = useState(false);
  const [accuracy, setAccuracy] = useState<number>();
  const [speed, setSpeed] = useState<number>();
  const data = useRef<TrackPoint[][]>([]);
  const durationRef = useRef(0);
  const started = useRef(0);
  const control = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (draft) {
        data.current = readSegments(draft.segments);
        durationRef.current = Number.isFinite(draft.duration) ? Math.max(0, draft.duration) : 0;
        setSegments(data.current);
        setDuration(durationRef.current);
      }
    } catch { /* No usable draft. */ }
    return () => control.current?.();
  }, [key]);

  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify({
        segments: data.current,
        duration: durationRef.current + (started.current ? Date.now() - started.current : 0),
      }));
    } catch { /* The current session still holds the route. */ }
  }

  function start() {
    if (control.current) return;
    if (!navigator.geolocation) { toast.error('GPS indisponible sur cet appareil.'); return; }
    let lastTime = 0;
    let lastPoint: TrackPoint | undefined;
    let segment: TrackPoint[] = [];
    let pointCount = data.current.reduce((total, line) => total + line.length, 0);
    let active = true;
    let wake: WakeLockSentinel | undefined;
    started.current = Date.now();
    setRecording(true);
    setAccuracy(undefined);
    setSpeed(undefined);

    async function keepScreenOn() {
      if (!active || document.hidden || (wake && !wake.released)) return;
      try {
        const lock = await navigator.wakeLock?.request('screen');
        if (!active) await lock?.release();
        else wake = lock;
      } catch { /* The device controls screen wake availability. */ }
    }
    void keepScreenOn();
    document.addEventListener('visibilitychange', keepScreenOn);

    const watch = navigator.geolocation.watchPosition(({ coords, timestamp }) => {
      if (!active) return;
      setAccuracy(Math.round(coords.accuracy));
      if (coords.accuracy > 35 || !Number.isFinite(coords.accuracy) || timestamp <= lastTime) {
        setSpeed(undefined);
        return;
      }
      const point: TrackPoint = [coords.latitude, coords.longitude];
      const gap = timestamp - lastTime > 30000;
      const reportedSpeed = coords.speed;
      const hasSpeed = reportedSpeed != null && Number.isFinite(reportedSpeed) && reportedSpeed >= 0 && reportedSpeed <= 70;
      if (lastPoint && !gap) {
        const moved = metersBetween(lastPoint, point);
        const seconds = (timestamp - lastTime) / 1000;
        const stationary = moved < Math.max(4, Math.min(coords.accuracy / 2, 12));
        if (moved > seconds * 70 + 35) return;
        setSpeed(hasSpeed ? reportedSpeed * 3.6 : stationary ? 0 : Math.min(70, moved / seconds) * 3.6);
        if (stationary) return;
      } else {
        setSpeed(hasSpeed ? reportedSpeed * 3.6 : undefined);
      }
      if (!lastPoint || gap) {
        segment = [];
        data.current = [...data.current, segment];
      }
      segment.push(point);
      lastPoint = point;
      lastTime = timestamp;
      pointCount++;
      setSegments([...data.current]);
      if (pointCount >= maxPoints) {
        stop();
        toast.info('La trace a atteint sa limite. Enregistre ce parcours avant de repartir.');
      }
    }, error => {
      if (error.code === 1 && active) {
        stop();
        toast.error('Autorise la localisation pour enregistrer ton parcours.');
      }
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });

    const timer = window.setInterval(() => {
      setDuration(durationRef.current + Date.now() - started.current);
      persist();
    }, 5000);
    const checkpoint = () => persist();
    window.addEventListener('pagehide', checkpoint);
    control.current = () => {
      active = false;
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(timer);
      window.removeEventListener('pagehide', checkpoint);
      document.removeEventListener('visibilitychange', keepScreenOn);
      void wake?.release().catch(() => {});
      durationRef.current += Date.now() - started.current;
      started.current = 0;
      control.current = undefined;
      persist();
    };
  }

  function stop() {
    control.current?.();
    setRecording(false);
    setSpeed(undefined);
    setDuration(durationRef.current);
  }

  function clear() {
    stop();
    data.current = [];
    durationRef.current = 0;
    setSegments([]);
    setDuration(0);
    setAccuracy(undefined);
    try { localStorage.removeItem(key); } catch { /* Draft already cleared in memory. */ }
  }

  return { segments, distance: trackDistance(segments), duration, recording, accuracy, speed, start, stop, clear };
}
