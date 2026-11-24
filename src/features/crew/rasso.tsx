import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { ClientOnly, Link } from '@tanstack/react-router';
import { CalendarDays, ImagePlus, LocateFixed, MapPin, Plus, Route, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CrewShell } from './shell';
import { resolveMedia, useCrew } from './context';
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
  const { add, name, records, upload } = useCrew();
  const [pin, setPin] = useState<TrackPoint>();
  const [showMap, setShowMap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const routes = records.filter(record => record.kind === 'ride-track' && record.payload['visibility'] !== 'private');

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
    const poster = data.get('poster');
    if (poster instanceof File && poster.size > 10 * 1024 * 1024) { toast.error('L’affiche doit faire moins de 10 Mo.'); return; }
    setSaving(true);
    try {
      const posterPath = poster instanceof File && poster.size ? await upload(poster, poster.name.split('.').at(-1)?.match(/^[a-z\d]{1,8}$/i)?.[0] ?? 'jpg') : undefined;
      await add('rasso', { title, place, when: when.toISOString(), host: name, ...(posterPath ? { poster: posterPath } : {}),
        ...(pin ? { pin } : {}), ...(ride ? { rideId: ride.id } : {}),
      });
      onSaved();
      toast.success('Rasso publié.');
    } catch { toast.error('Le rasso n’a pas pu être publié.'); }
    finally { setSaving(false); }
  }

  return <form className="grid gap-3" onSubmit={submit}>
    <label className="grid gap-1">Nom du rasso<input name="title" placeholder="Ex. Sortie du dimanche" maxLength={80} required /></label>
    <label className="grid gap-1">Photo d’affiche (facultative)<input name="poster" type="file" accept="image/jpeg,image/png,image/webp" /></label>
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

function EventPoster({ path }: { path: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    void resolveMedia(path).then(value => { if (active) setUrl(value); }).catch(() => {});
    return () => { active = false; };
  }, [path]);
  return url ? <img src={url} alt="Affiche du rasso" loading="lazy" className="max-h-96 w-full rounded-xl object-contain" /> : null;
}

function downloadCalendar(id: string, title: string, place: string, when: Date) {
  const escape = (value: string) => value.replace(/[\\;,\r\n]/g, character => {
    if (character === '\r') return '';
    if (character === '\n') return '\\n';
    return '\\' + character;
  });
  const date = (value: Date) => value.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const calendar = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MYbike//Rasso//FR', 'BEGIN:VEVENT',
    'UID:' + escape(id) + '@mybike', 'DTSTAMP:' + date(new Date()), 'DTSTART:' + date(when),
    'SUMMARY:' + escape(title), 'LOCATION:' + escape(place), 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  const url = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'rasso-mybike.ics';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    {typeof payload['poster'] === 'string' && <EventPoster path={payload['poster']} />}
    {date && <Button size="sm" variant="outline" className="justify-self-start" onClick={() => downloadCalendar(event.id, title, place, when)}><CalendarDays /> Ajouter au calendrier</Button>}
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
    <RassoAlbum eventId={event.id} canContribute={Number.isFinite(when.getTime()) && when.getTime() <= Date.now() && (host || votes.get(viewer)?.answer === 'Présent')} />
    {host && (deleting ? <div className="flex flex-wrap gap-2">
      <Button variant="destructive" size="sm" disabled={busy} onClick={deleteEvent}>Confirmer la suppression</Button>
      <Button variant="ghost" size="sm" onClick={() => setDeleting(false)}>Annuler</Button>
    </div> : <Button className="justify-self-start" size="sm" variant="ghost" onClick={() => setDeleting(true)}>Supprimer le rasso</Button>)}
  </article>;
}


function RassoAlbum({ eventId, canContribute }: { eventId: string; canContribute: boolean }) {
  const { records, name, add, upload } = useCrew();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const items = records.filter(record => record.kind === 'rasso-media' && record.payload['rassoId'] === eventId);

  async function addMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canContribute || busy) return;
    const form = event.currentTarget;
    const file = new FormData(form).get('file');
    if (!(file instanceof File) || !file.size || file.size > 50 * 1024 * 1024) {
      toast.error('Choisis un fichier de 50 Mo maximum.');
      return;
    }
    const video = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
    if (!video && !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
      toast.error('Choisis une photo JPEG, PNG, WebP ou AVIF, ou une vidéo MP4, MOV ou WebM.');
      return;
    }
    const extension = file.name.split('.').at(-1)?.match(/^[a-z\d]{1,8}$/i)?.[0] ?? (video ? 'mp4' : 'jpg');
    setBusy(true);
    try {
      const path = await upload(file, extension, 'rasso-media');
      await add('rasso-media', { rassoId: eventId, path, video, author: name });
      form.reset();
      toast.success('Souvenir ajouté à l’album.');
    } catch { toast.error('Le fichier n’a pas pu être ajouté.'); }
    finally { setBusy(false); }
  }

  return <details className="rounded-xl border border-border p-3" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Album du rasso{items.length > 0 ? ' · ' + items.length : ''}</summary>
    {open && <div className="mt-3 grid gap-3">
      {items.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(item => <RassoAlbumItem key={item.id} item={item} />)}
      </div> : <p className="text-sm text-muted-foreground">Aucun souvenir pour le moment.</p>}
      {canContribute ? <form className="grid gap-2" onSubmit={addMedia}>
        <label className="grid gap-1 text-sm">Photo ou vidéo
          <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime" disabled={busy} required />
        </label>
        <Button className="justify-self-start" size="sm" disabled={busy}><ImagePlus />{busy ? 'Envoi…' : 'Ajouter à l’album'}</Button>
      </form> : <p className="text-sm text-muted-foreground">L’organisateur et les pilotes inscrits comme présents peuvent ajouter leurs souvenirs après le rendez-vous.</p>}
    </div>}
  </details>;
}

function RassoAlbumItem({ item }: { item: CrewRecord }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const path = String(item.payload['path'] ?? '');
  const author = String(item.payload['author'] || 'Pilote');
  useEffect(() => {
    let active = true;
    void resolveMedia(path).then(value => { if (active) setUrl(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [path]);
  return <figure className="min-w-0">
    {url ? item.payload['video'] === true
      ? <video src={url} controls playsInline preload="metadata" className="w-full rounded-lg" />
      : <a href={url} target="_blank" rel="noreferrer"><img src={url} loading="lazy" alt={'Photo de ' + author} className="w-full rounded-lg" /></a>
      : <p className="text-sm text-muted-foreground">{failed ? 'Média indisponible' : 'Chargement…'}</p>}
    <figcaption className="mt-1 break-words text-xs text-muted-foreground">{author}</figcaption>
  </figure>;
}
