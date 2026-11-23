import { lazy, Suspense, useState, type FormEvent } from 'react';
import { ClientOnly, Link } from '@tanstack/react-router';
import { CalendarDays, LocateFixed, MapPin, Plus, Route, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CrewShell } from './shell';
import { useCrew } from './context';
import type { CrewRecord } from './data';
import { readSegments, type TrackPoint } from './tracks';

const MapView = lazy(() => import('./map-view'));
const emptyPoints: TrackPoint[] = [];
const ignoreMapClick = () => {};
const responses = ['Présent', 'Peut-être', 'Absent'] as const;
type Response = (typeof responses)[number];

function MeetingMap({ point, label, onPoint }: { point?: TrackPoint | undefined; label: string; onPoint?: (point: TrackPoint) => void }) {
  const markers = point ? [{ lat: point[0], lng: point[1], label, live: true }] : [];
  const focus = point ? point[0] + point[1] + 200 : 0;
  return <div className="rasso-map">
    <ClientOnly fallback={<div className="map-canvas bg-card" />}>
      <Suspense fallback={<div className="map-canvas bg-card" />}>
        <MapView points={emptyPoints} markers={markers} focus={focus} onPoint={onPoint ? (lat, lng) => onPoint([lat, lng]) : ignoreMapClick} />
      </Suspense>
    </ClientOnly>
  </div>;
}

export function RassoPage({ selected }: { selected?: string | undefined }) {
  const { records, user } = useCrew();
  const [creating, setCreating] = useState(false);
  const events = records.filter(record => record.kind === 'rasso').sort((a, b) =>
    String(a.payload['when']).localeCompare(String(b.payload['when'])));
  const pinned = selected ? events.find(record => record.id === selected) : undefined;
  const visible = pinned ? [pinned, ...events.filter(record => record.id !== pinned.id)] : events;
  return <CrewShell tab="Rasso">
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Les rendez-vous</h2>
        <Button onClick={() => setCreating(true)}><Plus /> Organiser un rasso</Button>
      </div>
      {!visible.length && <p className="ride-record text-muted-foreground">{selected && !user ? 'Connecte-toi pour ouvrir ce rasso.' : 'Aucun rasso prévu. Propose le prochain rendez-vous.'}</p>}
      {visible.map(event => <RassoCard key={event.id} event={event} highlighted={event.id === selected} />)}
    </div>
    <Dialog open={creating} onOpenChange={setCreating}>
      {creating && <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogTitle>Organiser un rasso</DialogTitle>
        <DialogDescription>{user ? 'Ton rendez-vous sera visible par les membres connectés à MYbike.' : 'Ce rendez-vous reste dans cette session de démo.'}</DialogDescription>
        <RassoForm onSaved={() => setCreating(false)} />
      </DialogContent>}
    </Dialog>
  </CrewShell>;
}

function RassoForm({ onSaved }: { onSaved: () => void }) {
  const { add, name, records } = useCrew();
  const [pin, setPin] = useState<TrackPoint>();
  const [showMap, setShowMap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const routes = records.filter(record => record.kind === 'ride-track');

  function locate() {
    if (!navigator.geolocation) { toast.error('Position indisponible sur cet appareil.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setPin([coords.latitude, coords.longitude]); setLocating(false); setShowMap(true);
    }, () => {
      setLocating(false); toast.error('Position indisponible. Tu peux choisir le point sur la carte.');
    }, { enableHighAccuracy: true, timeout: 12000 });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    const place = String(data.get('place') ?? '').trim();
    const when = new Date(String(data.get('when') ?? ''));
    const ride = routes.find(record => record.id === data.get('ride'));
    if (!title || !place || !Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) {
      toast.error('Renseigne le nom, le lieu et une date à venir.');
      return;
    }
    setSaving(true);
    try {
      await add('rasso', { title, place, when: when.toISOString(), host: name,
        ...(pin ? { pin } : {}), ...(ride ? { rideId: ride.id } : {}),
      });
      onSaved();
      toast.success('Rasso publié.');
    } catch { toast.error('Le rasso n’a pas pu être publié.'); }
    finally { setSaving(false); }
  }

  return <form className="grid gap-3" onSubmit={submit}>
    <label className="grid gap-1">Nom du rasso<input name="title" placeholder="Ex. Sortie du dimanche" maxLength={80} required /></label>
    <label className="grid gap-1">Date et heure<input className="w-full" name="when" type="datetime-local" required /></label>
    <label className="grid gap-1">Lieu de rendez-vous<input name="place" placeholder="Ex. Parking du lac" maxLength={140} required /></label>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => setShowMap(!showMap)}><MapPin /> {showMap ? 'Masquer la carte' : 'Choisir sur la carte'}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={locating} onClick={locate}><LocateFixed /> {locating ? 'Recherche…' : 'Ma position'}</Button>
    </div>
    {showMap && <div className="grid gap-2"><p className="text-sm text-muted-foreground">Touche la carte pour placer ou déplacer le rendez-vous.</p>
      <MeetingMap point={pin} label="Rendez-vous" onPoint={setPin} />
      {pin && <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={() => setPin(undefined)}>Retirer le repère</Button>}
    </div>}
    {routes.length > 0 && <label className="grid gap-1">Parcours (facultatif)<select name="ride">
      <option value="">Aucun parcours associé</option>
      {routes.map(route => <option key={route.id} value={route.id}>{String(route.payload['name'])}</option>)}
    </select></label>}
    <Button disabled={saving}>{saving ? 'Publication…' : 'Publier le rasso'}</Button>
  </form>;
}

function RassoCard({ event, highlighted }: { event: CrewRecord; highlighted: boolean }) {
  const { user, name, records, add, remove } = useCrew();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const { payload } = event;
  const title = String(payload['title']);
  const place = String(payload['place']);
  const when = new Date(String(payload['when']));
  const date = Number.isFinite(when.getTime()) ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(when) : '';
  const point = readSegments([[payload['pin']]])[0]?.[0];
  const host = !user || event.author_id === user.id;
  const viewer = user?.id ?? 'demo';
  const votes = new Map<string, { answer: Response; name: string }>();
  for (const record of records) {
    const answer = responses.find(response => response === record.payload['answer']);
    if (record.kind !== 'rasso-rsvp' || record.payload['rasso'] !== event.id || !answer) continue;
    votes.set(record.author_id ?? 'demo', { answer, name: String(record.payload['name'] || 'Pilote') });
  }
  const ride = typeof payload['rideId'] === 'string' && records.find(record => record.id === payload['rideId'] && record.kind === 'ride-track');

  async function respond(answer: Response) {
    if (busy || votes.get(viewer)?.answer === answer) return;
    setBusy(true);
    try { await add('rasso-rsvp', { rasso: event.id, answer, name }); }
    catch { toast.error('La réponse n’a pas été enregistrée.'); }
    finally { setBusy(false); }
  }

  async function share() {
    const url = new URL('/rasso', window.location.origin);
    url.searchParams.set('id', event.id);
    try {
      if (navigator.share) await navigator.share({ title, url: url.href });
      else { await navigator.clipboard.writeText(url.href); toast.success('Lien du rasso copié.'); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('Impossible de partager le lien.');
    }
  }

  async function deleteEvent() {
    setBusy(true);
    try { await remove(event.id); toast.success('Rasso supprimé.'); }
    catch { toast.error('Le rasso n’a pas pu être supprimé.'); }
    finally { setBusy(false); }
  }

  return <article className={`ride-record grid gap-4 ${highlighted ? 'ring-1 ring-primary' : ''}`}>
    <div>
      <h3 className="font-display text-3xl font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">Proposé par {String(payload['host'] ?? 'un pilote')}</p>
    </div>
    <div className="grid gap-2 text-sm">
      <p className="flex items-center gap-2"><CalendarDays size={17} className="text-primary" />{date}</p>
      <p className="flex items-center gap-2"><MapPin size={17} className="text-primary" />{place}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      {point && <Button size="sm" variant="outline" aria-expanded={mapOpen} onClick={() => setMapOpen(!mapOpen)}><MapPin /> {mapOpen ? 'Masquer le rendez-vous' : 'Voir le rendez-vous'}</Button>}
      {ride && <Button size="sm" variant="outline" asChild><Link to="/parcours/$rideId" params={{ rideId: ride.id }}><Route /> Parcours</Link></Button>}
      {user && <Button size="sm" variant="outline" onClick={share}><Share2 /> Inviter par lien</Button>}
    </div>
    {mapOpen && point && <MeetingMap point={point} label={place} />}
    <div className="flex flex-wrap gap-2" aria-label="Répondre au rasso">
      {responses.map(response => <Button key={response} size="sm" disabled={busy} aria-pressed={votes.get(viewer)?.answer === response}
        variant={votes.get(viewer)?.answer === response ? 'default' : 'outline'} onClick={() => void respond(response)}>
        {response} · {[...votes.values()].filter(vote => vote.answer === response).length}
      </Button>)}
    </div>
    {votes.size > 0 && <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer">Voir les réponses</summary>
      <ul className="mt-2 grid gap-1">{[...votes.entries()].map(([id, vote]) => <li key={id}>{vote.name} · {vote.answer}</li>)}</ul>
    </details>}
    {host && (deleting ? <div className="flex flex-wrap gap-2">
      <Button variant="destructive" size="sm" disabled={busy} onClick={deleteEvent}>Confirmer la suppression</Button>
      <Button variant="ghost" size="sm" onClick={() => setDeleting(false)}>Annuler</Button>
    </div> : <Button className="justify-self-start" size="sm" variant="ghost" onClick={() => setDeleting(true)}>Supprimer le rasso</Button>)}
  </article>;
}
