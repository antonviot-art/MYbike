import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { metersBetween, readSegments, readStops, trackDistance, type TrackPoint, type TrackStop } from './tracks';
import { createRideSpeed, type SpeedReading } from './ride-speed';

const maxPoints = 12000;

export function useTrackRecorder(key: string, onGoodFix?: (point: TrackPoint, timestamp: number, accuracy: number) => void) {
  const goodFix = useRef(onGoodFix);
  goodFix.current = onGoodFix;
  const [segments, setSegments] = useState<TrackPoint[][]>([]);
  const [duration, setDuration] = useState(0);
  const [recording, setRecording] = useState(false);
  const [accuracy, setAccuracy] = useState<number>();
  const [speedReading, setSpeedReading] = useState<SpeedReading>();
  const peak = useRef<number | undefined>(undefined);
  const [maxSpeed, setMaxSpeed] = useState<number>();
  const [position, setPosition] = useState<{ point: TrackPoint; accuracy: number }>();
  const [stops, setStops] = useState<TrackStop[]>([]);
  const savedStops = useRef<TrackStop[]>([]);
  const moving = useRef({ milliseconds: 0, meters: 0 });
  const [motion, setMotion] = useState(moving.current);
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
        savedStops.current = readStops(draft.stops);
        if (Number.isFinite(draft.motion?.milliseconds) && Number.isFinite(draft.motion?.meters)) moving.current = draft.motion;
        peak.current = typeof draft.maxSpeed === 'number' && Number.isFinite(draft.maxSpeed) && draft.maxSpeed >= 0 ? draft.maxSpeed : undefined;
        setMaxSpeed(peak.current);
        setStops(savedStops.current);
        setMotion(moving.current);
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
        stops: savedStops.current,
        motion: moving.current,
        maxSpeed: peak.current,
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
    let lastFix = -Infinity;
    let speedTimeout: number | undefined;
    const estimateSpeed = createRideSpeed();
    let previousMotion: { kmh: number; time: number } | undefined;
    let wake: WakeLockSentinel | undefined;
    started.current = Date.now();
    setRecording(true);
    setAccuracy(undefined);
    setSpeedReading(undefined);
    setPosition(undefined);

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
      if (!active || !Number.isFinite(timestamp) || timestamp <= lastFix) return;
      lastFix = timestamp;
      const point: TrackPoint = [coords.latitude, coords.longitude];
      if (!point.every(Number.isFinite)) return;
      if (Number.isFinite(coords.accuracy)) setPosition({ point, accuracy: coords.accuracy });
      setAccuracy(Math.round(coords.accuracy));
      const reading = estimateSpeed({ point, timestamp, accuracy: coords.accuracy, reported: coords.speed });
      if (reading && (peak.current === undefined || reading.kmh > peak.current)) {
        peak.current = reading.kmh;
        setMaxSpeed(reading.kmh);
      }
      if (reading && previousMotion) {
        const milliseconds = timestamp - previousMotion.time;
        const average = (previousMotion.kmh + reading.kmh) / 2;
        if (milliseconds <= 7000 && average >= 3.6) {
          moving.current = {
            milliseconds: moving.current.milliseconds + milliseconds,
            meters: moving.current.meters + average * milliseconds / 3600,
          };
          setMotion(moving.current);
        }
      }
      previousMotion = reading ? { kmh: reading.kmh, time: timestamp } : undefined;
      window.clearTimeout(speedTimeout);
      setSpeedReading(reading);
      if (reading) speedTimeout = window.setTimeout(() => setSpeedReading(undefined), 7000);
      if (coords.accuracy > 35 || !Number.isFinite(coords.accuracy)) return;
      goodFix.current?.(point, timestamp, coords.accuracy);
      const gap = timestamp - lastTime > 30000;
      if (lastPoint && !gap) {
        const moved = metersBetween(lastPoint, point);
        const seconds = (timestamp - lastTime) / 1000;
        const stationary = moved < Math.max(4, Math.min(coords.accuracy / 2, 12));
        if (moved > seconds * 70 + 35) return;
        if (stationary) return;
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
      window.clearTimeout(speedTimeout);
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
    setSpeedReading(undefined);
    setDuration(durationRef.current);
  }

  function clear() {
    stop();
    data.current = [];
    durationRef.current = 0;
    savedStops.current = [];
    moving.current = { milliseconds: 0, meters: 0 };
    setStops([]);
    setMotion(moving.current);
    peak.current = undefined;
    setMaxSpeed(undefined);
    setSegments([]);
    setDuration(0);
    setAccuracy(undefined);
    setPosition(undefined);
    try { localStorage.removeItem(key); } catch { /* Draft already cleared in memory. */ }
  }

  function addStop(label: string) {
    if (!position || position.accuracy > 35 || !label.trim() || savedStops.current.length >= 80) return false;
    savedStops.current = [...savedStops.current, { point: position.point, label: label.trim().slice(0, 80) }];
    setStops(savedStops.current);
    persist();
    return true;
  }

  return { segments, distance: trackDistance(segments), duration, recording, accuracy, speed: speedReading?.kmh, maxSpeed, speedSource: speedReading?.source, position, motion, stops, addStop, start, stop, clear };
}
