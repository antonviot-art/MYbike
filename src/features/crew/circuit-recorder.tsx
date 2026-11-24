import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { Flag, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useCrew } from './context';
import { metersBetween, readSegments, trackDistance, type TrackPoint } from './tracks';
import type { CrewRecord } from './data';
import { useTrackRecorder } from './use-track-recorder';

export function readLapTimes(value: unknown) {
  return Array.isArray(value) ? value.filter((time): time is number => typeof time === 'number' && Number.isFinite(time) && time > 0) : [];
}

export function formatLap(time: number) {
  const seconds = Math.floor(time / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + ',' + Math.floor(time / 100) % 10;
}

export function LapResults({ value }: { value: unknown }) {
  const laps = readLapTimes(value);
  if (!laps.length) return null;
  const best = Math.min(...laps);
  return <div className="grid gap-1"><h3 className="font-semibold">Chronos par tour</h3>
    <ol className="grid gap-1">{laps.map((time, index) => {
      const elapsed = formatLap(time);
      return <li key={index} className="flex justify-between gap-2 text-sm"><span>Tour {index + 1}{time === best ? ' · Meilleur temps' : ''}</span><strong className="tabular-nums">{elapsed}</strong></li>;
    })}</ol>
  </div>;
}

export function CircuitRecorder({ blocked, onActive, circuit }: { blocked: boolean; onActive?: (active: boolean) => void; circuit?: CrewRecord }) {
  const { add, user, name } = useCrew();
  const circuitPoints = readSegments(circuit?.payload['segments'])[0];
  const checkpoints = circuitPoints ? [0.25, 0.5, 0.75].flatMap(fraction => {
    const point = circuitPoints[Math.floor((circuitPoints.length - 1) * fraction)];
    return point ? [point] : [];
  }) : [];
  const timer = useRef<number | undefined>(undefined);
  const gate = useRef<{ start: TrackPoint; lastCrossing: number; away: boolean; firstLap: TrackPoint[]; loopComplete: boolean; checkpoint: number; previous?: { distance: number; timestamp: number } } | undefined>(undefined);
  const [delay, setDelay] = useState(10);
  const [remaining, setRemaining] = useState<number>();
  const [laps, setLaps] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const draft = useTrackRecorder('mybike:circuit:' + (user?.id ?? 'demo') + ':' + (circuit?.id ?? 'new'), (point, timestamp, accuracy) => {
    if (accuracy > 18) return;
    const state = gate.current;
    if (!state) {
      const start = circuitPoints?.[0] ?? point;
      if (metersBetween(start, point) > 15) return;
      gate.current = { start, lastCrossing: timestamp, away: false, firstLap: [point], loopComplete: false, checkpoint: 0 };
      return;
    }
    if (!state.loopComplete) state.firstLap.push(point);
    const distance = metersBetween(state.start, point);
    if (distance >= 45) state.away = true;
    const target = checkpoints[state.checkpoint];
    if (state.away && target && metersBetween(target, point) <= 35) state.checkpoint++;
    const previous = state.previous;
    state.previous = { distance, timestamp };
    if (state.away && distance <= 15 && timestamp - state.lastCrossing >= 12000) {
      if (state.checkpoint < checkpoints.length) {
        state.away = false;
        state.checkpoint = 0;
        state.lastCrossing = timestamp;
        return;
      }
      const crossing = previous && previous.distance > 15 && timestamp - previous.timestamp <= 3000
        ? previous.timestamp + (timestamp - previous.timestamp) * (previous.distance - 15) / (previous.distance - distance)
        : timestamp;
      const duration = crossing - state.lastCrossing;
      state.lastCrossing = crossing;
      state.away = false;
      state.checkpoint = 0;
      state.loopComplete = true;
      setLaps(previousLaps => [...previousLaps, duration]);
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
    const form = new FormData(event.currentTarget);
    const title = circuit ? String(circuit.payload['name'] ?? 'Boucle') : String(form.get('title') ?? '').trim();
    if (!title) return;
    setSaving(true);
    try {
      if (circuit) {
        if (!user) throw new Error('Connecte-toi pour publier tes chronos.');
        await add('circuit-lap', { circuitId: circuit.id, laps, pilot: name });
      } else {
        const visibility = form.get('visibility') === 'public' && user ? 'public' : 'private';
        const segments = gate.current ? [gate.current.firstLap] : draft.segments;
        await add('ride-track', { name: title, pilot: name, visibility, circuit: true, terrain: 'Cross',
          segments, distance: trackDistance(segments), duration: laps[0], maxSpeed: draft.maxSpeed, laps });
      }
      draft.clear();
      setLaps([]);
      toast.success(circuit ? 'Chronos ajoutés au classement.' : 'Boucle et chronos enregistrés dans Mes parcours.');
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
      <p role="status">{gate.current ? 'Chrono actif · ' + laps.length + ' tour(s)' : (circuit ? 'Approche de la ligne de départ avec un signal GPS précis…' : 'Attente d’un signal GPS précis…')}</p>
      <Button className="justify-self-start" onClick={draft.stop}><Flag /> Terminer la session</Button>
    </div> : <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm">Compte à rebours<select value={delay} onChange={event => setDelay(Number(event.target.value))}>
        <option value={0}>Départ immédiat</option><option value={5}>5 secondes</option><option value={10}>10 secondes</option><option value={30}>30 secondes</option><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={300}>5 minutes</option>
      </select></label>
      <Button disabled={blocked || saving} onClick={arm}><Timer /> Démarrer le chrono</Button>
    </div>}
    <LapResults value={laps} />
    {!active && laps.length > 0 && <form className="grid gap-2" onSubmit={save}>
      {!circuit && <><label className="grid gap-1 text-sm">Nom de la boucle<input required name="title" maxLength={80} /></label>
        {user && <label className="grid gap-1 text-sm">Visibilité<select name="visibility"><option value="private">Privée</option><option value="public">Publique sur MYbike</option></select></label>}</>}
      <Button className="justify-self-start" disabled={saving}>{circuit ? 'Publier mes chronos' : 'Enregistrer la boucle'}</Button>
    </form>}
    {!circuit && <Button asChild variant="outline" className="justify-self-start"><Link to="/map" search={{ loop: true }}>Proposer une boucle au GPS</Link></Button>}
  </section>;
}
