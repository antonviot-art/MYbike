import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ClientOnly, Link } from '@tanstack/react-router';
import { Bookmark, Circle, Gauge, MapPin, Maximize, Route, Share2, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCrew } from './context';
import { CrewShell } from './shell';
import { kilometers, readSegments, type TrackPoint, type TrackStop } from './tracks';
import { useTrackRecorder } from './use-track-recorder';
import { socialCall } from './social';
import { livePilots } from './live-location';
import type { CrewRecord } from './data';

const MapView = lazy(() => import('./map-view'));
const ignoreMapClick = () => {};
const noPoints: TrackPoint[] = [];
type Position = { point: TrackPoint; accuracy: number };
type DashboardLayout = 'map' | 'balanced' | 'speed';
const difficultyLevels = ['Facile', 'Modéré', 'Difficile', 'Très difficile', 'Expert'] as const;

function readDifficulty(value: unknown) {
  return difficultyLevels.find((_, index) => String(index + 1) === String(value));
}

function rideDifficulty(ride: CrewRecord, records: CrewRecord[]) {
  for (let index = records.length - 1; index >= 0; index--) {
    const item = records[index];
    if (item?.kind === 'ride-difficulty' && item.author_id === ride.author_id && item.payload['rideId'] === ride.id) {
      return item.payload['level'];
    }
  }
  return ride.payload['difficulty'];
}

export function DifficultyBadge({ ride }: { ride: CrewRecord }) {
  const { records } = useCrew();
  const value = rideDifficulty(ride, records);
  const label = readDifficulty(value);
  return <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
    {label ? String(value) + '/5 · ' + label : 'Difficulté non renseignée'}
  </span>;
}

function DifficultyOptions({ placeholder }: { placeholder: string }) {
  return <><option value="">{placeholder}</option>
    {difficultyLevels.map((label, index) => <option key={label} value={index + 1}>{index + 1}/5 · {label}</option>)}
  </>;
}

const terrains = ['Route', 'Cross', 'Enduro'] as const;
const dashboardLayoutKey = 'mybike:dashboard-layout';

export function RideStats({ distance, duration, motion, maxSpeed }: {
  distance: number; duration: number; motion?: { meters: number; milliseconds: number } | undefined;
  maxSpeed?: number | undefined;
}) {
  const formatDuration = (ms: number) => Math.floor(ms / 60000) + ' min ' + Math.floor(ms / 1000) % 60 + ' s';
  const formatSpeed = (kmh: number) => Number.isFinite(kmh) && kmh >= 0 ? kmh.toFixed(1).replace('.', ',') + ' km/h' : '—';
  return <dl className="weather-details">
    <div><dt>Distance</dt><dd>{kilometers(distance)}</dd></div>
    <div><dt>Durée totale</dt><dd>{formatDuration(duration)}</dd></div>
    <div><dt>Temps en mouvement</dt><dd>{motion && motion.milliseconds > 0 ? formatDuration(motion.milliseconds) : '—'}</dd></div>
    <div><dt>Vitesse max GPS</dt><dd>{formatSpeed(maxSpeed ?? NaN)}</dd></div>
    <div><dt>Moyenne en mouvement</dt><dd>{formatSpeed(motion ? motion.meters * 3600 / motion.milliseconds : NaN)}</dd></div>
    <div><dt>Moyenne sur la sortie</dt><dd>{formatSpeed(distance * 3600 / duration)}</dd></div>
  </dl>;
}

export function TrackMap({ segments, position, stops = [], follow = false, pilots = [], focusPilots = false, photoMarkers = [], onPoint = ignoreMapClick }: {
  segments: TrackPoint[][]; position?: Position | undefined; stops?: TrackStop[]; follow?: boolean; pilots?: ReturnType<typeof livePilots>; focusPilots?: boolean;
  onPoint?: (lat: number, lng: number) => void;
  photoMarkers?: { lat: number; lng: number; label: string; category: string; url?: string }[];
}) {
  const markers = [
    ...photoMarkers,
    ...stops.map(stop => ({ lat: stop.point[0], lng: stop.point[1], label: stop.label })),
    ...pilots.map(pilot => ({ ...pilot, showName: true })),
    ...(position ? [{ lat: position.point[0], lng: position.point[1], accuracy: position.accuracy, label: 'Ta position GPS', current: true, live: true }] : []),
  ];
  return <ClientOnly fallback={<div className="track-map map-canvas bg-secondary grid place-items-center">Chargement de la carte…</div>}>
    <Suspense fallback={<div className="track-map map-canvas bg-secondary" />}>
      <div className="track-map"><MapView points={noPoints} segments={segments} markers={markers} follow={follow}
        focus={position ? 1 : focusPilots && pilots.length ? 2 : 0} focusGroup={focusPilots} onPoint={onPoint} /></div>
    </Suspense>
  </ClientOnly>;
}

export function TrackList({ records, authors = false }: { records: CrewRecord[]; authors?: boolean }) {
  if (!records.length) return <p className="text-muted-foreground">Aucun parcours partagé pour le moment.</p>;
  return <div className="grid gap-3">{records.map(record => <TrackCard key={record.id} record={record} authors={authors} />)}</div>;
}

export function RideFavorite({ rideId }: { rideId: string }) {
  const { favoriteRides, toggleRideFavorite } = useCrew();
  const saved = favoriteRides.includes(rideId);
  return <Button type="button" variant="outline" size="sm" aria-pressed={saved} onClick={() => toggleRideFavorite(rideId)}>
    <Bookmark className={saved ? 'fill-current text-primary' : ''} />{saved ? 'Retirer de « À rouler »' : 'Ajouter à « À rouler »'}
  </Button>;
}

function TrackCard({ record, authors }: { record: CrewRecord; authors: boolean }) {
  const { user, update, refresh, remove, records, add } = useCrew();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'edit' | 'delete'>();
  const [busy, setBusy] = useState(false);
  const detail = useRef<HTMLDetailsElement>(null);
  const segments = useMemo(() => readSegments(record.payload['segments']), [record.payload]);
  const { payload, author_id: author } = record;
  const title = String(payload['name'] ?? 'Parcours');
  const description = String(payload['description'] ?? '');
  const difficulty = rideDifficulty(record, records);
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
    const submittedDifficulty = form.get('difficulty');
    const level = readDifficulty(submittedDifficulty) ? Number(submittedDifficulty) : null;
    if (!name) return;
    setBusy(true);
    try {
      if (user) {
        if (name !== title || next !== description) {
          await socialCall('mybike_ride_edit', { ride_id: record.id, ride_name: name, ride_description: next });
          await refresh();
        }
        if (level !== (readDifficulty(difficulty) ? Number(difficulty) : null)) {
          await add('ride-difficulty', { rideId: record.id, level });
        }
      } else await update(record.id, { ...payload, name, description: next, difficulty: level });
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
      {open && <div className="mt-3"><TrackMap segments={segments} /></div>}
    </details>
    <p className="mt-2 text-sm text-muted-foreground">{kilometers(Number(payload['distance']) || 0)} · {Math.round((Number(payload['duration']) || 0) / 60000)} min
      {authors && author && <> · <Link className="underline" to="/pilotes/$pilotId" params={{ pilotId: author }}>{String(payload['pilot'] ?? 'Pilote')}</Link></>}
    </p>
    <div className="mt-2"><DifficultyBadge ride={record} /></div>
    {description && <p className="mt-2 whitespace-pre-wrap break-words">{description}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <Button asChild size="sm"><Link to="/parcours/$rideId" params={{ rideId: record.id }}><Route /> Refaire ce parcours</Link></Button>
      <RideFavorite rideId={record.id} />
      {author && <Button variant="outline" size="sm" onClick={share}><Share2 /> Partager</Button>}
      {editable && <Button variant="outline" size="sm" onClick={() => setMode(mode === 'edit' ? undefined : 'edit')}>Modifier</Button>}
      {editable && <Button variant="ghost" size="sm" onClick={() => setMode(mode === 'delete' ? undefined : 'delete')}>Supprimer</Button>}
    </div>
    {mode === 'edit' && <form className="mt-3 grid gap-2" onSubmit={edit}>
      <label className="grid gap-1">Titre<input name="name" maxLength={80} required defaultValue={title} /></label>
      <label className="grid gap-1">Description<textarea name="description" maxLength={600} defaultValue={description} /></label>
      <label className="grid gap-1">Difficulté<select name="difficulty" defaultValue={readDifficulty(difficulty) ? String(difficulty) : ''}><DifficultyOptions placeholder="Non renseignée" /></select></label>
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
  const { user, name, records, add, positionClock, sharing, setSharing, favoriteRides } = useCrew();
  const draft = useTrackRecorder('mybike:track:' + (user?.id ?? 'demo'));
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [dashboard, setDashboard] = useState(false);
  const [focusPilots, setFocusPilots] = useState(false);
  const [dashboardLayout, setDashboardLayout] = useState<DashboardLayout>('balanced');
  const [addingStop, setAddingStop] = useState(false);
  const [tab, setTab] = useState<'mine' | 'explore' | 'saved'>('mine');
  const [terrain, setTerrain] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [place, setPlace] = useState('');
  const canSave = draft.segments.some(segment => segment.length > 1);
  const rides = records.filter(record => record.kind === 'ride-track').slice().reverse();
  const myRides = rides.filter(ride => user ? ride.author_id === user.id : /^[0-9a-f-]{36}$/i.test(ride.id));
  const query = place.trim().toLocaleLowerCase('fr');
  const matching = rides.filter(ride => (!terrain || ride.payload['terrain'] === terrain)
    && (!difficultyFilter || String(rideDifficulty(ride, records)) === difficultyFilter)
    && (!query || [ride.payload['place'], ride.payload['name'], ride.payload['description']].some(value =>
      String(value ?? '').toLocaleLowerCase('fr').includes(query))));
  const pilots = user && draft.recording ? livePilots(records, positionClock, user.id) : [];
  const pilotCount = pilots.length === 1 ? '1 pilote en direct' : pilots.length + ' pilotes en direct';
  const pilotFocusButton = pilots.length > 0 && <Button variant="outline" size="sm" aria-pressed={focusPilots} onClick={() => setFocusPilots(!focusPilots)}>
    {focusPilots ? 'Recentrer sur moi' : 'Voir tous les pilotes'}
  </Button>;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(dashboardLayoutKey);
      if (saved === 'map' || saved === 'balanced' || saved === 'speed') setDashboardLayout(saved);
    } catch { /* Keep the default layout. */ }
  }, []);

  function changeDashboardLayout(layout: DashboardLayout) {
    setDashboardLayout(layout);
    try { localStorage.setItem(dashboardLayoutKey, layout); } catch { /* The setting still applies to this session. */ }
  }

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
      await add('ride-track', { name: title, description, pilot: name, place: String(form.get('place') ?? '').trim(),
        difficulty: readDifficulty(form.get('difficulty')) ? Number(form.get('difficulty')) : null,
        terrain: terrains.find(item => item === form.get('terrain')), communityTrail: form.has('communityTrail'), segments: draft.segments, distance: draft.distance, duration: draft.duration, motion: draft.motion, maxSpeed: draft.maxSpeed, stops: draft.stops });
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
      <span className="font-display font-bold tabular-nums">{String(draft.speed === undefined ? '—' : Math.round(draft.speed)).split('').map((digit, index, digits) =>
        <span className="ride-speed-digit" key={digits.length - index}><span key={digit}>{digit}</span></span>)}</span>
      <span className="text-sm text-muted-foreground">km/h</span>
    </div>
    <p className="px-2 text-sm text-muted-foreground">{draft.speedSource === 'gps' ? 'Mesurée par le GPS' : draft.speedSource === 'estimate' ? 'Estimée sur plusieurs positions' : 'Vitesse GPS indisponible'}</p>
  </div>;
  const duration = Math.floor(draft.duration / 60000) + ' min ' + (Math.floor(draft.duration / 1000) % 60) + ' s';

  return <div className="mx-auto grid max-w-5xl gap-6">
    <div className="flex flex-wrap gap-2" aria-label="Vues des parcours">
      <Button variant={tab === 'mine' ? 'default' : 'outline'} aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>Mes parcours</Button>
      <Button variant={tab === 'explore' ? 'default' : 'outline'} aria-pressed={tab === 'explore'} onClick={() => setTab('explore')}>Explorer les parcours</Button>
      <Button variant={tab === 'saved' ? 'default' : 'outline'} aria-pressed={tab === 'saved'} onClick={() => setTab('saved')}><Bookmark /> À rouler</Button>
    </div>
    {dashboard && <section className="ride-dashboard" data-layout={dashboardLayout} aria-label="Tableau de bord du parcours" onKeyDown={event => { if (event.key === 'Escape') setDashboard(false); }}>
      <div className="ride-dashboard-stats">
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button size="icon" variant="outline" autoFocus aria-label="Fermer le tableau de bord" onClick={() => setDashboard(false)}><X /></Button>
          <label className="flex items-center gap-2 text-sm">
            <span>Affichage</span>
            <select aria-label="Répartition de l’écran" value={dashboardLayout} onChange={event => changeDashboardLayout(event.target.value as DashboardLayout)}>
              <option value="map">Plus de carte</option>
              <option value="balanced">Équilibré</option>
              <option value="speed">Plus de compteur</option>
            </select>
          </label>
        </div>
        {dial}
        <p>{kilometers(draft.distance)} · {duration}</p>
        {user && <p className="text-sm text-muted-foreground">{pilotCount}</p>}
        {pilotFocusButton}
        {draft.recording && <Button onClick={() => { draft.stop(); setDashboard(false); }}><Square /> Arrêter</Button>}
      </div>
      <TrackMap segments={draft.segments} position={draft.position} stops={draft.stops} pilots={pilots} focusPilots={focusPilots && pilots.length > 0} />
    </section>}
    <section hidden={tab !== 'mine'} className="ride-record gap-4" style={{ display: tab === 'mine' ? 'grid' : 'none' }}>
      <h2 className="text-xl font-semibold">Enregistrer un parcours</h2>
      {!dashboard && <TrackMap segments={draft.segments} position={draft.position} stops={draft.stops} pilots={pilots} focusPilots={focusPilots && pilots.length > 0} />}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <strong>{kilometers(draft.distance)}</strong><span>{duration}</span>
        {draft.recording && <span role="status">{draft.accuracy === undefined ? 'Recherche du signal GPS…' : draft.accuracy > 35 ? 'Signal GPS faible · en attente d’un meilleur point' : 'Précision GPS ± ' + draft.accuracy + ' m'}</span>}
      </div>
      {draft.recording && !dashboard && dial}
      {draft.recording && user && <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">{pilotCount}</span>
        {pilotFocusButton}
        <Button variant="outline" size="sm" aria-pressed={sharing} onClick={() => setSharing(!sharing)}>{sharing ? 'Arrêter le partage de ma position' : 'Partager ma position'}</Button>
      </div>}
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
      {!draft.recording && canSave && <RideStats distance={draft.distance} duration={draft.duration} motion={draft.motion} maxSpeed={draft.maxSpeed} />}
      {!draft.recording && canSave && <form onSubmit={publish} className="grid gap-2">
        <input name="title" aria-label="Nom du parcours" placeholder="Nom du parcours" required maxLength={80} />
        <textarea name="description" aria-label="Description du parcours" placeholder="Description (facultative)" maxLength={600} />
        <label className="grid gap-1">Lieu<input name="place" placeholder="Commune, département ou région" maxLength={100} /></label>
        <label className="grid gap-1">Terrain<select name="terrain"><option value="">Choisir un terrain</option>{terrains.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="grid gap-1">Difficulté estimée<select name="difficulty"><DifficultyOptions placeholder="Non renseignée" /></select></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="communityTrail" /> Afficher cette trace en bleu sur la carte communautaire si elle correspond à un chemin praticable absent du fond de carte.</label>
        <Button disabled={saving} className="justify-self-start"><Share2 />{saving ? 'Partage…' : user ? 'Partager le parcours' : 'Partager dans la démo'}</Button>
      </form>}
      {!draft.recording && draft.segments.length > 0 && !canSave && <p className="text-sm text-muted-foreground">Reprends l’enregistrement et avance à l’extérieur pour obtenir une trace partageable.</p>}
    </section>
    {tab === 'mine' ? <section className="grid gap-3">
      <h2 className="text-xl font-semibold">Mes parcours</h2>
      <TrackList records={myRides} />
    </section> : tab === 'saved' ? <section className="grid gap-3">
      <h2 className="text-xl font-semibold">À rouler</h2>
      {rides.some(ride => favoriteRides.includes(ride.id)) ? <TrackList records={rides.filter(ride => favoriteRides.includes(ride.id))} authors />
        : <p className="text-muted-foreground">Ajoute un parcours à tes favoris pour le retrouver ici.</p>}
    </section> : <section className="grid gap-3">
      <h2 className="text-xl font-semibold">Parcours de la communauté</h2>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Rechercher un lieu" value={place} onChange={event => setPlace(event.target.value)} placeholder="Lieu ou nom du parcours" />
        <select aria-label="Filtrer par terrain" value={terrain} onChange={event => setTerrain(event.target.value)}>
          <option value="">Tous les terrains</option>{terrains.map(item => <option key={item}>{item}</option>)}
        </select>
        <select aria-label="Filtrer par difficulté" value={difficultyFilter} onChange={event => setDifficultyFilter(event.target.value)}><DifficultyOptions placeholder="Toutes les difficultés" /></select>
      </div>
      <TrackList records={matching} authors />
    </section>}
  </div>;
}
