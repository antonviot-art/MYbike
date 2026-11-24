import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { Flag, Gauge, Map, Timer, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { TrackMap } from './rides';
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

type LapSample = [number, number, number];
type LapTrace = LapSample[];

function readLapTrace(value: unknown): LapTrace {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LapSample => Array.isArray(item) && item.length === 3 &&
    item.every(Number.isFinite) && Math.abs(item[0]) <= 90 && Math.abs(item[1]) <= 180 && item[2] >= 0);
}

function sectorTimes(samples: LapTrace) {
  let distance = 0;
  const points = samples.map(([lat, lng, time], index) => {
    const previous = samples[index - 1];
    if (previous) distance += metersBetween([previous[0], previous[1]], [lat, lng]);
    return { distance, time };
  });
  return [0.25, 0.5, 0.75].map(fraction => points.find(point => point.distance >= distance * fraction)?.time);
}

export function LapComparison({ value, times }: { value: unknown; times: unknown }) {
  const traces = useMemo(() => Array.isArray(value) ? value.map(readLapTrace) : [], [value]);
  const laps = readLapTimes(times);
  const [selection, setSelection] = useState<[number, number]>();
  const [open, setOpen] = useState(false);
  const valid = traces.map((trace, index) => trace.length > 1 && laps[index] ? index : -1).filter(index => index >= 0);
  if (valid.length < 2) return null;
  const [first, second] = selection && selection.every(index => valid.includes(index)) ? selection : [valid[0]!, valid[1]!];
  const firstTrace = traces[first]!;
  const secondTrace = traces[second]!;
  const mapPoints = (trace: LapTrace): TrackPoint[] => trace.map(([lat, lng]) => [lat, lng]);
  const baseSectors = sectorTimes(firstTrace);
  const comparedSectors = sectorTimes(secondTrace);
  return <details className="grid gap-2" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Comparer deux tours</summary>
    {open && <>
    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
      {[first, second].map((chosen, slot) => <label className="grid gap-1" key={slot}>{slot ? 'Tour comparé · bleu' : 'Tour de référence'}
        <select value={chosen} onChange={event => {
          const index = Number(event.currentTarget.value);
          setSelection(slot ? [first, index] : [index, second]);
        }}>{valid.map(index => <option key={index} value={index}>Tour {index + 1} · {formatLap(laps[index]!)}</option>)}</select>
      </label>)}
    </div>
    <div className="mt-2"><TrackMap key={first + ':' + second} segments={[mapPoints(firstTrace)]} comparison={mapPoints(secondTrace)} /></div>
    <dl className="mt-2 grid gap-1 text-sm">
      {baseSectors.map((time, index) => {
        const other = comparedSectors[index];
        if (time === undefined || other === undefined) return null;
        return <div key={index} className="flex justify-between gap-2"><dt>À {(index + 1) * 25} % du tour</dt><dd>{formatLapDelta(other - time)}</dd></div>;
      })}
      <div className="flex justify-between gap-2 font-semibold"><dt>À l’arrivée</dt><dd>{formatLapDelta(laps[second]! - laps[first]!)}</dd></div>
    </dl></>}
  </details>;
}

function formatLapDelta(milliseconds: number) {
  const seconds = Math.round(Math.abs(milliseconds) / 100) / 10;
  return seconds === 0 ? 'Même temps' : seconds.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' s ' + (milliseconds < 0 ? 'plus rapide' : 'plus lent');
}

export function CircuitRecorder({ blocked, onActive, circuit }: { blocked: boolean; onActive?: (active: boolean) => void; circuit?: CrewRecord }) {
  const { add, user, name, records } = useCrew();
  const circuitPoints = readSegments(circuit?.payload['segments'])[0];
  const checkpoints = circuitPoints ? [0.25, 0.5, 0.75].flatMap(fraction => {
    const point = circuitPoints[Math.floor((circuitPoints.length - 1) * fraction)];
    return point ? [point] : [];
  }) : [];
  const timer = useRef<number | undefined>(undefined);
  const samples = useRef<LapTrace>([]);
  const [lapTraces, setLapTraces] = useState<LapTrace[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [surface, setSurface] = useState('');
  const [notes, setNotes] = useState('');
  const vehicles = records.filter(record => record.kind === 'vehicle' && (user ? record.author_id === user.id : !record.author_id));
  const vehicle = vehicles.find(record => record.id === vehicleId);
  const vehicleName = vehicle ? String(vehicle.payload['name'] ?? 'Moto') : '';
  const sessionVehicle = useRef({ id: '', name: '' });
  const gate = useRef<{ start: TrackPoint; lastCrossing: number; away: boolean; firstLap: TrackPoint[]; loopComplete: boolean; checkpoint: number; previous?: { distance: number; timestamp: number } } | undefined>(undefined);
  const [delay, setDelay] = useState(10);
  const [remaining, setRemaining] = useState<number>();
  const [laps, setLaps] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [dashboard, setDashboard] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [clock, setClock] = useState(0);
  const draft = useTrackRecorder('mybike:circuit:' + (user?.id ?? 'demo') + ':' + (circuit?.id ?? 'new'), (point, timestamp, accuracy) => {
    if (accuracy > 18) return;
    const state = gate.current;
    if (!state) {
      const start = circuitPoints?.[0] ?? point;
      if (metersBetween(start, point) > 15) return;
      samples.current = [[point[0], point[1], 0]];
      gate.current = { start, lastCrossing: timestamp, away: false, firstLap: [point], loopComplete: false, checkpoint: 0 };
      return;
    }
    if (!state.loopComplete) state.firstLap.push(point);
    const sample = samples.current.at(-1);
    if (samples.current.length < 1200 && (!sample || metersBetween([sample[0], sample[1]], point) >= 3 || timestamp - state.lastCrossing - sample[2] >= 2000)) {
      samples.current.push([point[0], point[1], timestamp - state.lastCrossing]);
    }
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
        samples.current = [[point[0], point[1], 0]];
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
      const trace = [...samples.current.filter(sample => sample[2] < duration), [point[0], point[1], duration] as LapSample];
      samples.current = [[point[0], point[1], 0]];
      setLapTraces(previousTraces => [...previousTraces, trace]);
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

  useEffect(() => {
    if (!dashboard || !draft.recording) return;
    setClock(Date.now());
    const interval = window.setInterval(() => setClock(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, [dashboard, draft.recording]);

  function arm() {
    if (active || blocked) return;
    if (!navigator.geolocation) { toast.error('GPS indisponible.'); return; }
    draft.clear();
    gate.current = undefined;
    setLaps([]);
    setLapTraces([]);
    sessionVehicle.current = { id: vehicle?.id ?? '', name: vehicleName };
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
    const metadata = { lapTraces, surface, sessionNotes: notes.trim(), vehicleId: sessionVehicle.current.id, vehicleName: sessionVehicle.current.name };
    try {
      if (circuit) {
        if (!user) throw new Error('Connecte-toi pour publier tes chronos.');
        await add('circuit-lap', { circuitId: circuit.id, laps, pilot: name, ...metadata });
      } else {
        const visibility = form.get('visibility') === 'public' && user ? 'public' : 'private';
        const segments = gate.current ? [gate.current.firstLap] : draft.segments;
        await add('ride-track', { name: title, pilot: name, visibility, circuit: true, terrain: 'Cross',
          segments, distance: trackDistance(segments), duration: laps[0], maxSpeed: draft.maxSpeed, laps, ...metadata });
      }
      draft.clear();
      setLaps([]);
      setLapTraces([]);
      setNotes('');
      setSurface('');
      toast.success(circuit ? 'Chronos ajoutés au classement.' : 'Boucle et chronos enregistrés dans Mes parcours.');
    } catch { toast.error('Impossible d’enregistrer la boucle.'); }
    finally { setSaving(false); }
  }

  const controls = remaining !== undefined ? <div className="flex items-center gap-3">
      <strong role="status" className="text-3xl tabular-nums">{remaining} s</strong>
      <Button variant="outline" onClick={() => { window.clearInterval(timer.current); setRemaining(undefined); }}>Annuler</Button>
    </div> : draft.recording ? <div className="grid gap-2">
      <p role="status">{gate.current ? 'Chrono actif · ' + laps.length + ' tour(s)' : (circuit ? 'Approche de la ligne de départ avec un signal GPS précis…' : 'Attente d’un signal GPS précis…')}</p>
      <Button className="justify-self-start" onClick={draft.stop}><Flag /> Terminer la session</Button>
    </div> : <div className="flex flex-wrap items-end gap-2">
      {vehicles.length > 0 && <label className="grid gap-1 text-sm">Moto du chrono<select value={vehicleId} disabled={laps.length > 0} onChange={event => setVehicleId(event.currentTarget.value)}><option value="">Moto non renseignée</option>{vehicles.map(item => <option key={item.id} value={item.id}>{String(item.payload['name'] ?? 'Moto')}</option>)}</select></label>}
      <label className="grid gap-1 text-sm">Compte à rebours<select value={delay} onChange={event => setDelay(Number(event.target.value))}>
        <option value={0}>Départ immédiat</option><option value={5}>5 secondes</option><option value={10}>10 secondes</option><option value={30}>30 secondes</option><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={300}>5 minutes</option>
      </select></label>
      <Button disabled={blocked || saving} onClick={arm}><Timer /> Démarrer le chrono</Button>
    </div>;
  const personalHistory = circuit && user ? records.flatMap(record => record.kind === 'circuit-lap' && record.author_id === user.id && record.payload['circuitId'] === circuit.id && String(record.payload['vehicleId'] ?? '') === (laps.length || active ? sessionVehicle.current.id : vehicleId)
    ? readLapTimes(record.payload['laps']) : []) : [];
  if (circuit && user && circuit.author_id === user.id && String(circuit.payload['vehicleId'] ?? '') === (laps.length || active ? sessionVehicle.current.id : vehicleId)) personalHistory.push(...readLapTimes(circuit.payload['laps']));
  const best = Math.min(...laps, ...personalHistory);
  const lastLap = laps.at(-1);
  const priorBest = Math.min(...personalHistory, ...laps.slice(0, -1));
  const delta = lastLap !== undefined && Number.isFinite(priorBest) ? formatLapDelta(lastLap - priorBest) : undefined;
  const currentLap = draft.recording && gate.current && clock > 0 ? Math.max(0, clock - gate.current.lastCrossing) : undefined;

  return <section className="ride-record grid gap-4">
    <h2 className="text-xl font-semibold">Boucle chronométrée</h2>
    <p className="text-sm text-muted-foreground">Place-toi près de la ligne de départ. Le GPS détecte le retour pour chronométrer tes tours.</p>
    <p className="text-sm text-muted-foreground">Garde MYbike au premier plan. Le suivi et la vibration peuvent s’interrompre si le téléphone se verrouille.</p>
    {blocked && <p className="text-sm">Arrête ton enregistrement en cours pour lancer le chrono.</p>}
    <Button variant="outline" className="justify-self-start" onClick={() => setDashboard(true)}><Gauge /> Ouvrir le compteur</Button>
    {!dashboard && controls}
    <LapResults value={laps} />
    <Dialog open={dashboard} onOpenChange={setDashboard}>
      <DialogContent fullscreen hideCloseButton className="circuit-dashboard">
        <header className="flex items-center justify-between gap-2">
          <DialogTitle>Compteur de boucle</DialogTitle>
          <DialogDescription className="sr-only">Vitesse GPS et chronos de tes tours</DialogDescription>
          <Button size="icon" variant="ghost" aria-label="Fermer le compteur" onClick={() => setDashboard(false)}><X /></Button>
        </header>
        <div className="grid gap-1 rounded-xl bg-secondary p-4">
          <span className="text-sm text-muted-foreground">Ton meilleur tour{sessionVehicle.current.name && (active || laps.length > 0) ? ' · ' + sessionVehicle.current.name : vehicleName ? ' · ' + vehicleName : ''}</span>
          <strong className="text-4xl tabular-nums">{Number.isFinite(best) ? formatLap(best) : '—'}</strong>
          {delta && <p className="text-sm" role="status">Dernier tour · {delta} que ton record précédent</p>}
        </div>
        <div className="circuit-dashboard-readout">
          <div className="grid content-start gap-2">
            <div className="flex items-baseline gap-2"><strong className="text-4xl tabular-nums">{draft.speed === undefined ? '—' : Math.round(draft.speed)}</strong><span>km/h</span></div>
            <p className="text-sm">Tour en cours <strong className="tabular-nums">{currentLap === undefined ? '—' : formatLap(currentLap)}</strong></p>
            <Button size="sm" variant="ghost" className="justify-self-start" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}><Map /> {showMap ? 'Masquer la carte' : 'Afficher la carte'}</Button>
          </div>
          {showMap && <div className="circuit-mini-map"><TrackMap segments={circuitPoints ? [circuitPoints] : draft.segments} position={draft.position} /></div>}
        </div>
        {controls}
        <LapResults value={laps} />
        {!active && laps.length > 0 && <Button variant="outline" onClick={() => setDashboard(false)}>Fermer pour enregistrer les chronos</Button>}
      </DialogContent>
    </Dialog>
    {!active && <LapComparison value={lapTraces} times={laps} />}
    {!active && laps.length > 0 && <form className="grid gap-2" onSubmit={save}>
      {!circuit && <><label className="grid gap-1 text-sm">Nom de la boucle<input required name="title" maxLength={80} /></label>
        {user && <label className="grid gap-1 text-sm">Visibilité<select name="visibility"><option value="private">Privée</option><option value="public">Publique sur MYbike</option></select></label>}</>}
      <label className="grid gap-1 text-sm">État du terrain<select value={surface} onChange={event => setSurface(event.currentTarget.value)}><option value="">Non renseigné</option><option>Sec</option><option>Humide</option><option>Boueux</option></select></label>
      <label className="grid gap-1 text-sm">Notes de session<textarea value={notes} maxLength={400} onChange={event => setNotes(event.currentTarget.value)} placeholder="Ex. Ornières après le virage 3" /></label>
      <Button className="justify-self-start" disabled={saving}>{circuit ? 'Publier mes chronos' : 'Enregistrer la boucle'}</Button>
    </form>}
    {!circuit && <Button asChild variant="outline" className="justify-self-start"><Link to="/map" search={{ loop: true }}>Proposer une boucle au GPS</Link></Button>}
  </section>;
}
