import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CrewRecord } from './data';

export function livePilots(records: CrewRecord[], now: number, exclude?: string) {
  const active = new Map<string, { lat: number; lng: number; label: string; live: true; expires: number }>();
  if (!now) return [];
  for (const record of records) {
    if (record.kind !== 'live-position' || (exclude && record.author_id === exclude)) continue;
    const lat = Number(record.payload['lat']);
    const lng = Number(record.payload['lng']);
    const expires = Number(record.payload['expires']);
    if (!Number.isFinite(expires) || expires <= now || !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const id = record.author_id ?? record.id;
    if ((active.get(id)?.expires ?? 0) >= expires) continue;
    active.set(id, { lat, lng, label: String(record.payload['label'] || 'Pilote'), live: true, expires });
  }
  return [...active.values()];
}

export function useLiveLocation(userId: string | undefined, name: string, enabled: boolean) {
  const [status, setStatus] = useState<'waiting' | 'live' | 'denied' | 'unavailable' | 'retrying'>('waiting');
  useEffect(() => {
    setStatus('waiting');
    if (!userId || !enabled) return;
    if (!navigator.geolocation) { setStatus('unavailable'); return; }
    const authorId = userId;
    let active = true;
    let recordId: string | undefined;
    let writing = false;
    let watch: number | undefined;
    let generation = 0;
    const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };

    async function remove(id: string) {
      await supabase.from('group_records').delete().eq('id', id).eq('author_id', authorId);
    }

    async function publish(position: GeolocationPosition, current: number) {
      if (!active || current !== generation || document.hidden || writing || Date.now() - position.timestamp > 15000) return;
      writing = true;
      const payload = { lat: position.coords.latitude, lng: position.coords.longitude, label: name, expires: Date.now() + 45000 };
      try {
        if (recordId) {
          const { data, error } = await supabase.from('group_records').update({ payload }).eq('id', recordId)
            .eq('author_id', authorId).select('id').maybeSingle();
          if (error) throw error;
          if (!data) recordId = undefined;
        }
        if (!recordId && active && current === generation && !document.hidden) {
          const { data, error } = await supabase.from('group_records').insert({ kind: 'live-position', payload, author_id: authorId }).select('id').single();
          if (error) throw error;
          recordId = data.id;
          if (!active) await remove(recordId);
        }
        if (active && current === generation && recordId) setStatus('live');
      } catch {
        if (active && current === generation) setStatus('retrying');
      } finally {
        writing = false;
      }
    }

    function onFailure(error: GeolocationPositionError, current: number) {
      if (active && current === generation) setStatus(error.code === 1 ? 'denied' : 'waiting');
    }

    function probe() {
      if (document.hidden) return;
      const current = generation;
      navigator.geolocation.getCurrentPosition(value => { void publish(value, current); },
        error => onFailure(error, current), options);
    }

    function resume() {
      generation++;
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      watch = undefined;
      if (document.hidden) return;
      setStatus('waiting');
      const current = generation;
      watch = navigator.geolocation.watchPosition(value => { void publish(value, current); },
        error => onFailure(error, current), options);
    }

    resume();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('online', probe);
    const heartbeat = window.setInterval(probe, 15000);
    return () => {
      active = false;
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('online', probe);
      window.clearInterval(heartbeat);
      if (recordId) void remove(recordId);
    };
  }, [userId, name, enabled]);

  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 5000);
    return () => window.clearInterval(timer);
  }, []);
  return { now, status };
}
