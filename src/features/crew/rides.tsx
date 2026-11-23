import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { ClientOnly, Link } from '@tanstack/react-router';
import { Circle, Gauge, MapPin, Maximize, Route, Share2, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCrew } from './context';
import { CrewShell } from './shell';
import { kilometers, readSegments, type TrackPoint, type TrackStop } from './tracks';
import { useTrackRecorder } from './use-track-recorder';
import { socialCall } from './social';
import type { CrewRecord } from './data';

const MapView = lazy(() => import('./map-view'));
const ignoreMapClick = () => {};
const noPoints: TrackPoint[] = [];
type Position = { point: TrackPoint; accuracy: number };

export function TrackMap({ segments, position, stops = [], follow = false }: { segments: TrackPoint[][]; position?: Position | undefined; stops?: TrackStop[]; follow?: boolean }) {
  const markers = [
    ...stops.map(stop => ({ lat: stop.point[0], lng: stop.point[1], label: stop.label })),
    ...(position ? [{ lat: position.point[0], lng: position.point[1], accuracy: position.accuracy, label: 'Ta position GPS', current: true, live: true }] : []),
  ];
  return <ClientOnly fallback={<div className="track-map map-canvas bg-secondary grid place-items-center">Chargement de la carte…</div>}>
    <Suspense fallback={<div className="track-map map-canvas bg-secondary" />}>
      <div className="track-map"><MapView points={noPoints} segments={segments} markers={markers} follow={follow} focus={position ? 1 : 0} onPoint={ignoreMapClick} /></div>
    </Suspense>
  </ClientOnly>;
}

export function TrackList({ records, authors = false }: { records: CrewRecord[]; authors?: boolean }) {
  if (!records.length) return <p className="text-muted-foreground">Aucun parcours partagé pour le moment.</p>;
  return <div className="grid gap-3">{records.map(record => <TrackCard key={record.id} record={record} authors={authors} />)}</div>;
}

function TrackCard({ record, authors }: { record: CrewRecord; authors: boolean }) {
  const { user, update, refresh, remove } = useCrew();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'edit' | 'delete'>();
  const [busy, setBusy] = useState(false);
  const detail = useRef<HTMLDetailsElement>(null);
  const { payload, author_id: author } = record;
  const title = String(payload['name'] ?? 'Parcours');
  const description = String(payload['description'] ?? '');
  const editable = !user || user.id === author;
  const anchor = 'parcours-' + record.id;

  useEffect(() => {
    if (window.location.hash !== '#' + anchor || !detail.current) return;
    detail.current.open = true;
    setOpen(true);
    detail.current.scrollIntoView();
  }, [anchor]);

  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || busy) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const next = String(form.get('description') ?? '').trim();
    if (!name) return;
    setBusy(true);
    try {
      if (user) {
        await socialCall('mybike_ride_edit', { ride_id: record.id, ride_name: name, ride_description: next });
        await refresh();
      } else await update(record.id, { ...payload, name, description: next });
      setMode(undefined);
      toast.success('Parcours modifié.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de modifier le parcours.');
    } finally { setBusy(false); }
  }

  async function deleteRide() {
    if (!editable || busy) return;
    setBusy(true);
    try { await remove(record.id); toast.success('Parcours supprimé.'); }
    catch { toast.error('Impossible de supprimer le parcours.'); }
    finally { setBusy(false); }
  }

  async function share() {
    if (!author) return;
    const url = new URL('/parcours/' + encodeURIComponent(record.id), window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); toast.success('Lien du parcours copié.'); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('Le lien n’a pas pu être partagé.');
    }
  }

  return <article className="ride-record" id={anchor}>
    <details ref={detail} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold"><Route className="mr-2 inline text-primary" size={18} />{title}</summary>
      {open && <div className="mt-3"><TrackMap segments={readSegments(payload['segments'])} /></div>}
    </details>
    <p className="mt-2 text-sm text-muted-foreground">{kilometers(Number(payload['distance']) || 0)} · {Math.round((Number(payload['duration']) || 0) / 60000)} min
      {authors && author && <> · <Link className="underline" to="/pilotes/$pilotId" params={{ pilotId: author }}>{String(payload['pilot'] ?? 'Pilote')}</Link></>}
    </p>
    {description && <p className="mt-2 whitespace-pre-wrap break-words">{description}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <Button asChild size="sm"><Link to="/parcours/$rideId" params={{ rideId: record.id }}><Route /> Refaire ce parcours</Link></Button>
      {author && <Button variant="outline" size="sm" onClick={share}><Share2 /> Partager</Button>}
      {editable && <Button variant="outline" size="sm" onClick={() => setMode(mode === 'edit' ? undefined : 'edit')}>Modifier</Button>}
      {editable && <Button variant="ghost" size="sm" onClick={() => setMode(mode === 'delete' ? undefined : 'delete')}>Supprimer</Button>}
    </div>
    {mode === 'edit' && <form className="mt-3 grid gap-2" onSubmit={edit}>
      <label className="grid gap-1">Titre<input name="name" maxLength={80} required defaultValue={title} /></label>
      <label className="grid gap-1">Description<textarea name="description" maxLength={600} defaultValue={description} /></label>
      <Button className="justify-self-start" disabled={busy}>Enregistrer</Button>
    </form>}
    {mode === 'delete' && <div className="mt-3 flex flex-wrap items-center gap-2">
      <p>Retirer ce parcours de ton profil ?</p>
      <Button variant="destructive" size="sm" disabled={busy} onClick={deleteRide}>Confirmer</Button>
    </div>}
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
  const [dashboard, setDashboard] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const canSave = draft.segments.some(segment => segment.length > 1);
  const rides = records.filter(record => record.kind === 'ride-track').slice().reverse();

  useEffect(() => {
    if (!dashboard) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [dashboard]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || draft.recording || saving) return;
    const target = event.currentTarget;
    const form = new FormData(target);
    const title = String(form.get('title') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    if (!title) return;
    setSaving(true);
    try {
      await add('ride-track', { name: title, description, pilot: name, segments: draft.segments, distance: draft.distance, duration: draft.duration, motion: draft.motion, stops: draft.stops });
      draft.clear();
      target.reset();
      toast.success(user ? 'Parcours partagé sur ton profil.' : 'Parcours ajouté à cette démo.');
    } catch {
      toast.error('Le parcours n’a pas été partagé. Le brouillon est conservé.');
    } finally { setSaving(false); }
  }

  const dial = <div>
    <div className="ride-speed" aria-label="Vitesse GPS actuelle">
      <Gauge size={24} aria-hidden="true" />
      <span className="font-display font-bold tabular-nums">{draft.speed === undefined ? '—' : Math.round(draft.speed)}</span>
      <span className="text-sm text-muted-foreground">km/h</span>
    </div>
    <p className="px-2 text-sm text-muted-foreground">{draft.speedSource === 'gps' ? 'Mesurée par le GPS' : draft.speedSource === 'estimate' ? 'Estimée sur plusieurs positions' : 'Vitesse GPS indisponible'}</p>
  </div>;
  const duration = Math.floor(draft.duration / 60000) + ' min ' + (Math.floor(draft.duration / 1000) % 60) + ' s';

  return <div className="mx-auto grid max-w-5xl gap-6">
    {dashboard && <section className="ride-dashboard" aria-label="Tableau de bord du parcours" onKeyDown={event => { if (event.key === 'Escape') setDashboard(false); }}>
      <div className="ride-dashboard-stats">
        <Button size="icon" variant="outline" autoFocus aria-label="Fermer le tableau de bord" onClick={() => setDashboard(false)}><X /></Button>
        {dial}
        <p>{kilometers(draft.distance)} · {duration}</p>
        {draft.recording && <Button onClick={() => { draft.stop(); setDashboard(false); }}><Square /> Arrêter</Button>}
      </div>
      <TrackMap segments={draft.segments} position={draft.position} stops={draft.stops} />
    </section>}
    <section className="ride-record grid gap-4">
      <h2 className="text-xl font-semibold">Enregistrer un parcours</h2>
      {!dashboard && <TrackMap segments={draft.segments} position={draft.position} stops={draft.stops} />}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <strong>{kilometers(draft.distance)}</strong><span>{duration}</span>
        {draft.recording && <span role="status">{draft.accuracy === undefined ? 'Recherche du signal GPS…' : draft.accuracy > 35 ? 'Signal GPS faible · en attente d’un meilleur point' : 'Précision GPS ± ' + draft.accuracy + ' m'}</span>}
      </div>
      {draft.recording && !dashboard && dial}
      <p className="text-sm text-muted-foreground">Garde cet écran ouvert pendant l’enregistrement. La trace reste sur cet appareil jusqu’au partage.</p>
      <div className="flex flex-wrap gap-2">
        {draft.recording
          ? <Button onClick={draft.stop}><Square /> Arrêter</Button>
          : <Button onClick={draft.start} disabled={saving}><Circle /> {draft.segments.length ? 'Reprendre' : 'Démarrer'}</Button>}
        {draft.recording && <Button variant="outline" onClick={() => setDashboard(true)}><Maximize /> Tableau de bord</Button>}
        {draft.recording && <Button variant="outline" disabled={!draft.position || draft.position.accuracy > 35} onClick={() => setAddingStop(!addingStop)}><MapPin /> Ajouter un repère</Button>}
        {!draft.recording && draft.segments.length > 0 && <Button variant="ghost" disabled={saving} onClick={() => {
          if (discard) { draft.clear(); setDiscard(false); } else setDiscard(true);
        }}>{discard ? 'Confirmer la suppression' : 'Effacer le brouillon'}</Button>}
      </div>
      {draft.recording && addingStop && <form className="flex flex-wrap gap-2" onSubmit={event => {
        event.preventDefault();
        const label = String(new FormData(event.currentTarget).get('label') ?? '');
        if (!draft.addStop(label)) { toast.error('Vérifie le nom et le signal GPS.'); return; }
        setAddingStop(false);
        toast.success('Repère ajouté au parcours.');
      }}>
        <input name="label" className="flex-1" placeholder="Ex. Pause ou rendez-vous" aria-label="Nom du repère" maxLength={80} required />
        <Button>Enregistrer le repère</Button>
      </form>}
      {!draft.recording && canSave && <dl className="grid grid-cols-3 gap-2 text-sm">
        <div><dt>Distance</dt><dd className="font-semibold">{kilometers(draft.distance)}</dd></div>
        <div><dt>Durée</dt><dd className="font-semibold">{duration}</dd></div>
        <div><dt>Moyenne en mouvement</dt><dd className="font-semibold">{draft.motion.milliseconds > 0 ? (draft.motion.meters * 3600 / draft.motion.milliseconds).toFixed(1) + ' km/h' : '—'}</dd></div>
      </dl>}
      {!draft.recording && canSave && <form onSubmit={publish} className="grid gap-2">
        <input name="title" aria-label="Nom du parcours" placeholder="Nom du parcours" required maxLength={80} />
        <textarea name="description" aria-label="Description du parcours" placeholder="Description (facultative)" maxLength={600} />
        <Button disabled={saving} className="justify-self-start"><Share2 />{saving ? 'Partage…' : user ? 'Partager le parcours' : 'Partager dans la démo'}</Button>
      </form>}
      {!draft.recording && draft.segments.length > 0 && !canSave && <p className="text-sm text-muted-foreground">Reprends l’enregistrement et avance à l’extérieur pour obtenir une trace partageable.</p>}
    </section>
    <section className="grid gap-3">
      <h2 className="text-xl font-semibold">Parcours partagés</h2>
      <TrackList records={rides} authors />
    </section>
  </div>;
}
