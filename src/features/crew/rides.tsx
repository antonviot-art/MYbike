import { lazy, Suspense, useState, type FormEvent } from 'react';
import { ClientOnly, Link } from '@tanstack/react-router';
import { Circle, Gauge, Route, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCrew } from './context';
import { CrewShell } from './shell';
import { kilometers, readSegments, type TrackPoint } from './tracks';
import { useTrackRecorder } from './use-track-recorder';
import type { CrewRecord } from './data';

const MapView = lazy(() => import('./map-view'));
const ignoreMapClick = () => {};
const noPoints: TrackPoint[] = [];
const noMarkers: [] = [];

export function TrackMap({ segments }: { segments: TrackPoint[][] }) {
  return <ClientOnly fallback={<div className="track-map map-canvas bg-secondary grid place-items-center">Chargement de la carte…</div>}>
    <Suspense fallback={<div className="track-map map-canvas bg-secondary" />}>
      <div className="track-map"><MapView points={noPoints} segments={segments} markers={noMarkers} focus={0} onPoint={ignoreMapClick} /></div>
    </Suspense>
  </ClientOnly>;
}

export function TrackList({ records, authors = false }: { records: CrewRecord[]; authors?: boolean }) {
  if (!records.length) return <p className="text-muted-foreground">Aucun parcours partagé pour le moment.</p>;
  return <div className="grid gap-3">{records.map(record => <TrackCard key={record.id} record={record} authors={authors} />)}</div>;
}

function TrackCard({ record, authors }: { record: CrewRecord; authors: boolean }) {
  const [open, setOpen] = useState(false);
  const { payload, author_id: author } = record;
  return <article className="ride-record">
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold"><Route className="mr-2 inline text-primary" size={18} />{String(payload['name'] ?? 'Parcours')}</summary>
      {open && <div className="mt-3"><TrackMap segments={readSegments(payload['segments'])} /></div>}
    </details>
    <p className="mt-2 text-sm text-muted-foreground">{kilometers(Number(payload['distance']) || 0)} · {Math.round((Number(payload['duration']) || 0) / 60000)} min
      {authors && author && <> · <Link className="underline" to="/pilotes/$pilotId" params={{ pilotId: author }}>{String(payload['pilot'] ?? 'Pilote')}</Link></>}
    </p>
  </article>;
}

export function RidesPage() {
  const { user } = useCrew();
  return <CrewShell tab="Parcours"><RideRecorder key={user?.id ?? 'demo'} /></CrewShell>;
}

function RideRecorder() {
  const { user, name, records, add } = useCrew();
  const draft = useTrackRecorder('mybike:track:' + (user?.id ?? 'demo'));
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const canSave = draft.segments.some(segment => segment.length > 1);
  const rides = records.filter(record => record.kind === 'ride-track').slice().reverse();

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || draft.recording || saving) return;
    const eventForm = event.currentTarget;
    const title = String(new FormData(eventForm).get('title') ?? '').trim();
    if (!title) return;
    setSaving(true);
    try {
      await add('ride-track', { name: title, pilot: name, segments: draft.segments, distance: draft.distance, duration: draft.duration });
      draft.clear();
      eventForm.reset();
      toast.success(user ? 'Parcours partagé sur ton profil.' : 'Parcours ajouté à cette démo.');
    } catch {
      toast.error('Le parcours n’a pas été partagé. Le brouillon est conservé.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="mx-auto grid max-w-5xl gap-6">
    <section className="ride-record grid gap-4">
      <h2 className="text-xl font-semibold">Enregistrer un parcours</h2>
      <TrackMap segments={draft.segments} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <strong>{kilometers(draft.distance)}</strong>
        <span>{Math.floor(draft.duration / 60000)} min {Math.floor(draft.duration / 1000) % 60} s</span>
        {draft.recording && <span role="status">{draft.accuracy === undefined ? 'Recherche du signal GPS…' : draft.accuracy > 35 ? 'Signal GPS faible · en attente d’un meilleur point' : 'Précision GPS ± ' + draft.accuracy + ' m'}</span>}
      </div>
      {draft.recording && <div className="ride-speed" aria-label="Vitesse GPS actuelle">
        <Gauge size={24} aria-hidden="true" />
        <span className="font-display text-5xl font-bold tabular-nums">{draft.speed === undefined ? '—' : Math.round(draft.speed)}</span>
        <span className="text-sm text-muted-foreground">km/h</span>
      </div>}
      <p className="text-sm text-muted-foreground">Garde cet écran ouvert pendant l’enregistrement. La trace reste sur cet appareil jusqu’au partage.</p>
      <div className="flex flex-wrap gap-2">
        {draft.recording
          ? <Button onClick={draft.stop}><Square /> Arrêter</Button>
          : <Button onClick={draft.start} disabled={saving}><Circle /> {draft.segments.length ? 'Reprendre' : 'Démarrer'}</Button>}
        {!draft.recording && draft.segments.length > 0 && <Button variant="ghost" disabled={saving} onClick={() => {
          if (discard) { draft.clear(); setDiscard(false); }
          else setDiscard(true);
        }}>{discard ? 'Confirmer la suppression' : 'Effacer le brouillon'}</Button>}
      </div>
      {!draft.recording && canSave && <form onSubmit={publish} className="flex flex-wrap gap-2">
        <input name="title" aria-label="Nom du parcours" placeholder="Nom du parcours" required maxLength={80} className="min-w-0 flex-1" />
        <Button disabled={saving} variant="secondary">{saving ? 'Partage…' : user ? 'Partager sur mon profil' : 'Partager dans la démo'}</Button>
      </form>}
    </section>
    <section className="grid gap-3">
      <h2 className="text-xl font-semibold">Parcours partagés</h2>
      <TrackList records={rides} authors />
    </section>
  </div>;
}
