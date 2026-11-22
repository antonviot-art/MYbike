import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useLiveLocation(userId: string | undefined, name: string, enabled: boolean, stop: () => void) {
  useEffect(() => {
    if (!userId || !enabled) return;
    const authorId = userId;
    let active = true;
    let recordId: string | undefined;
    let writing = false;
    let position: GeolocationPosition | undefined;

    async function remove(id: string) {
      const { error } = await supabase.from('group_records').delete().eq('id', id).eq('author_id', authorId);
      if (error) toast.error('La position peut rester visible jusqu’à son expiration.');
    }

    async function publish() {
      if (!active || !position || writing) return;
      writing = true;
      const payload = { lat: position.coords.latitude, lng: position.coords.longitude, label: name, expires: Date.now() + 45000 };
      try {
        if (recordId) {
          const { error } = await supabase.from('group_records').update({ payload }).eq('id', recordId).eq('author_id', authorId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from('group_records').insert({ kind: 'live-position', payload, author_id: authorId }).select('id').single();
          if (error) throw error;
          recordId = data.id;
          if (!active) await remove(recordId);
        }
      } catch {
        if (active) {
          toast.error('Le partage de position a échoué.');
          stop();
        }
      } finally {
        writing = false;
      }
    }

    const watch = navigator.geolocation.watchPosition(value => {
      position = value;
      void publish();
    }, () => {
      toast.error('Position indisponible. Vérifie les autorisations de localisation.');
      stop();
    }, { maximumAge: 5000, timeout: 15000 });
    const heartbeat = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(value => {
        position = value;
        void publish();
      }, () => {}, { maximumAge: 5000, timeout: 10000 });
    }, 15000);

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(heartbeat);
      if (recordId) void remove(recordId);
    };
  }, [userId, name, enabled, stop]);

  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 5000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
