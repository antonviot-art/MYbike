import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { Flag, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useCrew } from './context';
import { metersBetween, trackDistance, type TrackPoint } from './tracks';
import { useTrackRecorder } from './use-track-recorder';

export function LapResults({ value }: { value: unknown }) {
  const laps = Array.isArray(value) ? value.filter((time): time is number => typeof time === 'number' && Number.isFinite(time) && time > 0) : [];
  if (!laps.length) return null;
  const best = Math.min(...laps);
  return <div className="grid gap-1"><h3 className="font-semibold">Chronos par tour</h3>
    <ol className="grid gap-1">{laps.map((time, index) => {
      const seconds = Math.floor(time / 1000);
      const elapsed = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + ',' + Math.floor(time / 100) % 10;
      return <li key={index} className="flex justify-between gap-2 text-sm"><span>Tour {index + 1}{time === best ? ' · Meilleur temps' : ''}</span><strong className="tabular-nums">{elapsed}</strong></li>;
    })}</ol>
  </div>;
}

export function CircuitRecorder({ blocked, onActive }: { blocked: boolean; onActive?: (active: boolean) => void }) {
  const { add, user, name } = useCrew();
  const timer = useRef<number | undefined>(undefined);
  const gate = useRef<{ start: TrackPoint; lastCrossing: number; away: boolean; firstLap: TrackPoint[]; loopComplete: boolean } | undefined>(undefined);
  const [delay, setDelay] = useState(10);
  const [remaining, setRemaining] = useState<number>();
  const [laps, setLaps] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const draft = useTrackRecorder('mybike:circuit:' + (user?.id ?? 'demo'), (point, timestamp) => {
    const state = gate.current;
    if (!state) { gate.current = { start: point, lastCrossing: timestamp, away: false, firstLap: [point], loopComplete: false }; return; }
    if (!state.loopComplete) state.firstLap.push(point);
    const distance = metersBetween(state.start, point);
    if (distance >= 45) state.away = true;
    if (state.away && distance <= 20 && timestamp - state.lastCrossing >= 12000) {
      const duration = timestamp - state.lastCrossing;
      state.lastCrossing = timestamp;
      state.away = false;
      state.loopComplete = true;
      setLaps(previous => [...previous, duration]);
    }
  });
  const active = draft.recording || remaining !== undefined;
  useEffect(() => { onActive?.(active); }, [active, onActive]);
  useEffect(() => () => window.clearInterval(timer.current), []);
  const counting = remaining !== undefined;
  useEffect(() => {
    if (!counting) return;
    let active = true;
    let lock: WakeLockSentinel | undefined;
    void navigator.wakeLock?.request('screen').then(value => {
      if (active) lock = value;
      else void value.release().catch(() => {});
    }).catch(() => {});
    return () => { active = false; void lock?.release().catch(() => {}); };
  }, [counting]);

  function arm() {
    if (active || blocked) return;
    if (!navigator.geolocation) { toast.error('GPS indisponible.'); return; }
    draft.clear();
    gate.current = undefined;
    setLaps([]);
    const start = () => { setRemaining(undefined); navigator.vibrate?.(400); draft.start(); };
    if (!delay) { start(); return; }
    const deadline = Date.now() + delay * 1000;
    setRemaining(delay);
    timer.current = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (seconds > 0) { setRemaining(seconds); return; }
      window.clearInterval(timer.current);
      start();
    }, 150);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!laps.length || active || saving) return;
    const title = String(new FormData(event.currentTarget).get('title') ?? '').trim();
    if (!title) return;
    setSaving(true);
    try {
      const segments = gate.current ? [gate.current.firstLap] : draft.segments;
      await add('ride-track', { name: title, pilot: name, visibility: 'private', terrain: 'Cross',
        segments, distance: trackDistance(segments), duration: laps[0], maxSpeed: draft.maxSpeed, laps });
      draft.clear();
      setLaps([]);
      toast.success('Boucle et chronos enregistrés dans Mes parcours.');
    } catch { toast.error('Impossible d’enregistrer la boucle.'); }
    finally { setSaving(false); }
  }

  return <section className="ride-record grid gap-4">
    <h2 className="text-xl font-semibold">Boucle chronométrée</h2>
    <p className="text-sm text-muted-foreground">Place-toi près de la ligne de départ. Au lancement, le premier point GPS précis fixe la ligne. Un tour compte quand tu t’en éloignes puis reviens à proximité.</p>
    <p className="text-sm text-muted-foreground">Garde MYbike au premier plan. Le suivi et la vibration peuvent s’interrompre si le téléphone se verrouille.</p>
    {blocked && <p className="text-sm">Arrête ton enregistrement en cours pour lancer le chrono.</p>}
    {remaining !== undefined ? <div className="flex items-center gap-3">
      <strong role="status" className="text-3xl tabular-nums">{remaining} s</strong>
      <Button variant="outline" onClick={() => { window.clearInterval(timer.current); setRemaining(undefined); }}>Annuler</Button>
    </div> : draft.recording ? <div className="grid gap-2">
      <p role="status">{gate.current ? 'Chrono actif · ' + laps.length + ' tour(s)' : 'Attente d’un signal GPS précis…'}</p>
      <Button className="justify-self-start" onClick={draft.stop}><Flag /> Terminer la session</Button>
    </div> : <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm">Compte à rebours<select value={delay} onChange={event => setDelay(Number(event.target.value))}>
        <option value={0}>Départ immédiat</option><option value={5}>5 secondes</option><option value={10}>10 secondes</option><option value={30}>30 secondes</option><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={300}>5 minutes</option>
      </select></label>
      <Button disabled={blocked || saving} onClick={arm}><Timer /> Démarrer le chrono</Button>
    </div>}
    <LapResults value={laps} />
    {!active && laps.length > 0 && <form className="grid gap-2" onSubmit={save}>
      <label className="grid gap-1 text-sm">Nom de la boucle<input required name="title" maxLength={80} /></label>
      <Button className="justify-self-start" disabled={saving}>Enregistrer la boucle</Button>
    </form>}
    <Button asChild variant="outline" className="justify-self-start"><Link to="/map" search={{ loop: true }}>Proposer une boucle au GPS</Link></Button>
  </section>;
}
