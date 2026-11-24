import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Download, Heart, Images, MapPin, MessageCircle, MoreHorizontal, Plus, Share2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Avatar, CrewShell } from './shell';
import { Link } from '@tanstack/react-router';
import { useCrew, resolveMedia } from './context';
import { images } from './data';
import { toast } from 'sonner';
import { socialCall } from './social';
import { jpeg, loadPhoto } from './photo-crop';
import { photoGps } from './photo-gps';
import { readSegments, type TrackPoint } from './tracks';
import { TrackMap } from './rides';
import { licensedStoryTracks, type StoryTrack } from './story-music';

type MediaItem = {
  id: string;
  url: string;
  original: string;
  title: string;
  date: string;
  session: string;
  video: boolean;
  visibility?: string;
  description?: string;
  place?: string;
  gps?: TrackPoint | undefined;
  author?: string | null | undefined;
  authorName?: string;
  link?: string | undefined;
  storyUntil?: number;
  music?: string | undefined;
  musicId?: string | undefined;
};

const originalStoryTracks: StoryTrack[] = [
  { id: 'ligne-rouge', title: 'Ligne rouge', style: 'Électro · 132 BPM' },
  { id: 'route-de-nuit', title: 'Route de nuit', style: 'Synthé · 98 BPM' },
  { id: 'poussiere', title: 'Poussière', style: 'Breakbeat · 112 BPM' },
  { id: 'bitume', title: 'Bitume', style: 'Électro · 126 BPM' },
  { id: 'derapage', title: 'Dérapage', style: 'Techno · 145 BPM' },
  { id: 'virage', title: 'Virage', style: 'Basse · 114 BPM' },
  { id: 'horizon', title: 'Horizon', style: 'Chill · 88 BPM' },
  { id: 'after-ride', title: 'After Ride', style: 'Groove · 104 BPM' },
  { id: 'plein-gaz', title: 'Plein gaz', style: 'Électro rapide · 150 BPM' },
  { id: 'reflets', title: 'Reflets', style: 'Synthé · 92 BPM' },
  { id: 'signal', title: 'Signal', style: 'Électro · 118 BPM' },
  { id: 'crepuscule', title: 'Crépuscule', style: 'Chill · 80 BPM' },
];

const storyTracks = [...originalStoryTracks, ...licensedStoryTracks];

function storyTrackUrl(track: StoryTrack) {
  return '/story-music/' + track.id + (track.credit ? '.mp3' : '.wav');
}

type CommunityTrack = { id: string; title: string; author: string; path: string };

const demo = [
  { key: 'ride', title: 'Tous au départ', date: '2026-11-15', session: 'Les Vosges' },
  { key: 'red', title: 'La Beta de Maxime', date: '2026-11-15', session: 'Les Vosges' },
  { key: 'quad', title: 'Le Raptor prend la pose', date: '2026-11-08', session: 'Sortie du dimanche' },
  { key: 'orange', title: 'Prête pour les chemins', date: '2026-11-08', session: 'Sortie du dimanche' },
].map(({ key, ...item }): MediaItem => ({
  ...item, id: key, url: key === 'ride' ? '/mybike-enduro.jpg' : images[key] ?? '',
  original: key === 'ride' ? '/mybike-enduro.jpg' : images[key] ?? '', video: false,
}));

function coordinates(value: unknown): TrackPoint | undefined {
  if (Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]) &&
      Math.abs(value[0]) <= 90 && Math.abs(value[1]) <= 180) return [value[0], value[1]];
  return undefined;
}

function webLink(value: unknown) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch { return undefined; }
}

export function MediaPage({ initialRide, initialPost }: { initialRide?: string | undefined; initialPost?: string | undefined }) {
  const { user } = useCrew();
  return <MediaGallery key={(user?.id ?? 'demo') + (initialRide ?? '') + (initialPost ?? '')} initialRide={initialRide} initialPost={initialPost} />;
}

function MediaGallery({ initialRide, initialPost }: { initialRide: string | undefined; initialPost: string | undefined }) {
  const { records, add, upload, user, refresh, name } = useCrew();
  const [visibility, setVisibility] = useState('public');
  const [filter, setFilter] = useState('Toutes les sorties');
  const [sort, setSort] = useState('recent');
  const [selected, setSelected] = useState<MediaItem>();
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState<MediaItem[]>([]);
  const [publishing, setPublishing] = useState<'post' | 'story' | undefined>(initialRide ? 'post' : undefined);
  const [files, setFiles] = useState<File[]>([]);
  const [now, setNow] = useState(Date.now);
  const [openedLink, setOpenedLink] = useState(false);
  const [rideId, setRideId] = useState(initialRide ?? '');
  const [photoPoint, setPhotoPoint] = useState<TrackPoint>();
  const [choosingPoint, setChoosingPoint] = useState(false);
  const communityTracks = useMemo(() => user ? records.flatMap((record): CommunityTrack[] => {
    const path = record.payload['path'];
    if (record.kind !== 'story-audio' || !record.author_id || typeof path !== 'string' ||
        !path.startsWith(record.author_id + '/story-audio/')) return [];
    return [{ id: record.id, title: String(record.payload['title'] || 'Son communautaire'),
      author: String(record.payload['author'] || 'Pilote'), path }];
  }).reverse() : [], [records, user]);

  const rides = records.filter(record => record.kind === 'ride-track').slice().reverse();

  const rideSegments = rides.find(ride => ride.id === rideId)?.payload['segments'];
  const photoRoute = useMemo(() => readSegments(rideSegments), [rideSegments]);

  useEffect(() => {
    let active = true;
    const media = records.filter(record => record.kind === 'media' && (!record.payload['storyUntil'] || Number(record.payload['storyUntil']) > Date.now()));
    void Promise.allSettled(media.map(async ({ id, payload, author_id }): Promise<MediaItem> => ({
      id, url: await resolveMedia(String(payload['preview'])), original: String(payload['original']),
      title: String(payload['title']), date: String(payload['date']), session: String(payload['session']),
      video: Boolean(payload['video']), visibility: String(payload['visibility'] ?? 'public'),
      description: String(payload['description'] ?? ''), place: String(payload['place'] ?? ''), gps: coordinates(payload['gps']),
      author: author_id, authorName: String(payload['authorName'] || 'Pilote'),
      link: webLink(payload['link']), storyUntil: Number(payload['storyUntil']) || 0,
      music: typeof payload['music'] === 'string' ? payload['music'] : undefined,
      musicId: typeof payload['musicId'] === 'string' ? payload['musicId'] : undefined,
    }))).then(results => {
      if (active) setExtra(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
    });
    return () => { active = false; };
  }, [records]);

  useEffect(() => {
    if (!user) return;
    const sync = () => void refresh().catch(() => {});
    sync();
    const timer = window.setInterval(sync, 240000);
    return () => window.clearInterval(timer);
  }, [user, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!initialPost || openedLink) return;
    const match = extra.find(item => item.id === initialPost && (!item.storyUntil || item.storyUntil > now));
    if (match) { setSelected(match); setOpenedLink(true); }
  }, [initialPost, openedLink, extra, now]);

  const stories = extra.filter(item => (item.storyUntil ?? 0) > now).slice().reverse();
  const all = [...(user ? [] : demo), ...extra.filter(item => !item.storyUntil)];
  const items = all.filter(item => filter === 'Toutes les sorties' || item.session === filter)
    .sort((a, b) => sort === 'recent' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !files.length) return;
    const fields = new FormData(event.currentTarget);
    const description = String(fields.get('description') ?? '').trim();
    const place = String(fields.get('place') ?? '').trim();
    const rawLink = String(fields.get('link') ?? '').trim();
    const link = webLink(rawLink);
    if (rawLink && !link) { toast.error('Ajoute un lien qui commence par https://.'); return; }
    const story = publishing === 'story';
    const ride = story ? undefined : rides.find(item => item.id === fields.get('ride'));
    const includeGps = fields.has('gps');
    setBusy(true);
    try {
      if (files.some(file => file.size > 50 * 1024 * 1024)) throw new Error('Un fichier dépasse 50 Mo.');
      if (user && visibility === 'friends') await socialCall('mybike_friends_list', {});
      const folder = visibility === 'friends' ? 'friends' : undefined;
      const track = story ? [...storyTracks, ...communityTracks].find(item => item.id === fields.get('musicId')) : undefined;
      for (const file of files) {
        const video = file.type.startsWith('video/');
        const extension = file.name.split('.').at(-1)?.match(/^[a-z\d]{1,8}$/i)?.[0] ?? (video ? 'mp4' : 'jpg');
        const gps = !video ? (ride && photoPoint ? photoPoint : includeGps ? await photoGps(file) : undefined) : undefined;
        let previewBlob: Blob | undefined;
        if (!video) {
          const image = await loadPhoto(file);
          const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            previewBlob = await jpeg(canvas, 0.8);
          }
        }
        const [original, thumbnail] = await Promise.all([upload(file, extension, folder), previewBlob ? upload(previewBlob, 'jpg', folder) : undefined]);
        const preview = thumbnail ?? original;
        await add('media', {
          original, preview, title: file.name, date: new Date().toISOString().slice(0, 10),
          session: ride ? String(ride.payload['name'] ?? 'Parcours') : 'Nouvelle sortie',
          video, visibility, description, place, authorName: name, ...(gps ? { gps } : {}),
          ...(ride ? { rideId: ride.id } : {}), ...(link ? { link } : {}),
          ...(story ? { storyUntil: Date.now() + 86400000, ...(track ? { musicId: track.id } : {}) } : {}),
        });
        setFiles(pending => pending.filter(item => item !== file));
      }
      setPublishing(undefined);
      setPhotoPoint(undefined);
      setChoosingPoint(false);
      toast.success(story ? 'Story publiée pour 24 heures.' : 'Publication ajoutée.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de publier les médias.');
    } finally { setBusy(false); }
  }

  async function download() {
    if (!selected) return;
    try {
      const original = selected.original.startsWith('/') ? selected.original : await resolveMedia(selected.original);
      const response = await fetch(original);
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = selected.title;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error('Téléchargement indisponible.'); }
  }

  return <CrewShell tab="Médias">
    <div className="media-feed">
    <section aria-label="Stories">
      <h2 className="font-semibold">Stories</h2>
      <div className="media-stories">
        <button className="media-story-chip" onClick={() => { setFiles([]); setPublishing('story'); }}><span><Plus /></span><span>Ta story</span></button>
        {stories.map(item => <button className="media-story-chip" key={item.id} onClick={() => setSelected(item)}>
          <span>{item.video ? <video src={item.url} muted preload="metadata" /> : <img src={item.url} alt="" />}</span><span className="max-w-full truncate">{item.authorName}</span>
        </button>)}
      </div>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-semibold"><Images className="text-primary" /> Le fil MYbike</h2>
      <Button onClick={() => { setFiles([]); setPublishing('post'); }}><Upload /> Publier</Button>
    </div>
    <div className="flex flex-wrap justify-between gap-3">
      <select aria-label="Filtrer par sortie" value={filter} onChange={event => setFilter(event.target.value)}>
        {['Toutes les sorties', ...new Set(all.map(item => item.session))].map(session => <option key={session}>{session}</option>)}
      </select>
      <select aria-label="Trier par date" value={sort} onChange={event => setSort(event.target.value)}>
        <option value="recent">Plus récentes</option><option value="old">Plus anciennes</option>
      </select>
    </div>
    {!items.length && <p className="text-muted-foreground">Aucune publication pour le moment.</p>}
    {items.map(item => <article key={item.id}>
      <div className="mb-3 flex items-center gap-2">
        <Avatar userId={item.author} pilot={(item.authorName || 'M').charAt(0).toUpperCase()} />
        {item.author ? <Link to="/pilotes/$pilotId" params={{ pilotId: item.author }} className="font-semibold hover:underline">{item.authorName}</Link>
          : <span className="font-semibold">{item.authorName || 'MYbike · Démo'}</span>}
      </div>
      {item.video ? <FeedVideo url={item.url} /> : <Button variant="ghost" className="relative h-auto w-full overflow-hidden p-0" onClick={() => setSelected(item)} aria-label={'Voir ' + item.title}>
        <img src={item.url} alt={item.title} className="media-photo" loading="lazy" />
      </Button>}
      <h3 className="mt-2 break-words text-sm font-semibold">{item.title}</h3>
      <p className="text-xs text-muted-foreground">{item.visibility === 'friends' && 'Amis seulement · '}{item.place || item.session} · {new Date(item.date).toLocaleDateString('fr-FR')}</p>
      {item.description && <p className="mt-1 line-clamp-2 text-sm">{item.description}</p>}
      {item.link && <a className="mt-2 inline-block break-all text-sm underline" href={item.link} target="_blank" rel="noopener noreferrer">Ouvrir le lien</a>}
      {item.visibility !== 'friends' && <MediaActions item={item} />}
    </article>)}
    </div>
    <Dialog open={Boolean(publishing)} onOpenChange={open => { if (!open && !busy) setPublishing(undefined); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle>{publishing === 'story' ? 'Ajouter une story' : 'Nouvelle publication'}</DialogTitle>
        <DialogDescription>{publishing === 'story' ? 'Ta story reste dans le fil pendant 24 heures.' : 'Ajoute tes photos ou vidéos, et un lien si tu veux.'}</DialogDescription>
        <form className="grid gap-3" onSubmit={publish}>
          <label className="grid gap-1">Photos ou vidéos<input type="file" className="w-full" accept="image/*,video/*,.heic,.heif" multiple disabled={busy}
            onChange={event => setFiles(Array.from(event.target.files ?? []))} /></label>
          {files.length > 0 && <p className="text-sm text-muted-foreground">{files.length} fichier(s) à publier</p>}
          {publishing === 'story' && <StoryMusicPicker community={communityTracks} />}
          <label className="grid gap-1">Description<textarea name="description" rows={3} maxLength={600} /></label>
          <label className="grid gap-1">Lien (facultatif)<input name="link" type="url" maxLength={500} placeholder="https://…" /></label>
          <label className="grid gap-1">Lieu (facultatif)<input name="place" maxLength={120} placeholder="Ex. Forêt de Clairvaux" /></label>
          {publishing !== 'story' && rides.length > 0 && <label className="grid gap-1">Associer à un parcours
            <select name="ride" value={rideId} onChange={event => { setRideId(event.target.value); setPhotoPoint(undefined); }}><option value="">Aucun parcours</option>
              {rides.map(ride => <option key={ride.id} value={ride.id}>{String(ride.payload['name'] ?? 'Parcours')}</option>)}
            </select>
          </label>}
          {publishing === 'post' && rideId && photoRoute.length > 0 && <div className="grid gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setChoosingPoint(!choosingPoint)}>
              <MapPin /> {choosingPoint ? 'Masquer la carte' : 'Placer les photos sur la carte'}
            </Button>
            {choosingPoint && <>
              <p className="text-sm text-muted-foreground">Touche le lieu de prise de vue. Le repère s’applique à toutes les photos sélectionnées.</p>
              <TrackMap key={rideId} segments={photoRoute} onPoint={(lat, lng) => setPhotoPoint([lat, lng])}
                photoMarkers={photoPoint ? [{ lat: photoPoint[0], lng: photoPoint[1], label: 'Lieu des photos', category: 'photo' }] : []} />
            </>}
            {photoPoint && <Button type="button" variant="ghost" size="sm" onClick={() => setPhotoPoint(undefined)}>Retirer le repère des photos</Button>}
          </div>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="gps" defaultChecked={Boolean(initialRide)} /> Afficher les coordonnées GPS des photos JPEG qui en contiennent</label>
          {user && <label className="grid gap-1">Visibilité<select value={visibility} onChange={event => setVisibility(event.target.value)} disabled={busy}>
            <option value="public">Public sur MYbike</option><option value="friends">Amis seulement</option>
          </select></label>}
          <Button disabled={busy || !files.length}>{busy ? 'Publication…' : 'Publier'}</Button>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(undefined); }}>
      {selected?.storyUntil ? <StoryViewer key={selected.id} item={selected} community={communityTracks.find(track => track.id === selected.musicId)} close={() => setSelected(undefined)} download={download} /> : selected && <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogTitle>{selected.title}</DialogTitle>
        <DialogDescription>{selected.session}</DialogDescription>
        {selected.video ? <video src={selected.url} controls className="w-full max-h-[60vh]" /> : <img src={selected.url} alt={selected.title} className="w-full max-h-[60vh] object-contain" />}
        {selected.description && <p className="whitespace-pre-wrap break-words">{selected.description}</p>}
        {selected.link && <a className="underline" href={selected.link} target="_blank" rel="noopener noreferrer">Ouvrir le lien</a>}
        {selected.place && <p className="flex items-center gap-2"><MapPin size={16} />{selected.place}</p>}
        {selected.gps && <a className="underline" href={'https://www.openstreetmap.org/?mlat=' + selected.gps[0] + '&mlon=' + selected.gps[1] + '#map=16/' + selected.gps[0] + '/' + selected.gps[1]}>Voir le lieu sur la carte</a>}
        <Button onClick={download}><Download /> Télécharger l’original</Button>
      </DialogContent>}
    </Dialog>
  </CrewShell>;
}

function FeedVideo({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void video.play().catch(() => {});
      else video.pause();
    }, { threshold: 0.55 });
    observer.observe(video);
    return () => { observer.disconnect(); video.pause(); };
  }, [url]);
  return <video ref={ref} src={url} muted playsInline controls preload="metadata" className="media-video" />;
}

function StoryMusicPicker({ community }: { community: CommunityTrack[] }) {
  const [id, setId] = useState('');
  const track = storyTracks.find(item => item.id === id);
  const communityTrack = community.find(item => item.id === id);
  const [preview, setPreview] = useState<{ path: string; url: string }>();
  useEffect(() => {
    if (!communityTrack) return;
    let active = true;
    void resolveMedia(communityTrack.path).then(url => {
      if (active) setPreview({ path: communityTrack.path, url });
    }).catch(() => { if (active) toast.error('Aperçu indisponible.'); });
    return () => { active = false; };
  }, [communityTrack]);
  const previewUrl = track ? storyTrackUrl(track) : preview?.path === communityTrack?.path ? preview?.url : undefined;
  return <div className="grid gap-2">
    <label className="grid gap-1">Ajouter une musique
      <select name="musicId" value={id} onChange={event => setId(event.currentTarget.value)}>
        <option value="">Sans musique</option>
        <optgroup label="Catalogue MYbike">
          {originalStoryTracks.map(item => <option key={item.id} value={item.id}>{item.title} · {item.style}</option>)}
        </optgroup>
        <optgroup label="Musique libre">
          {licensedStoryTracks.map(item => <option key={item.id} value={item.id}>{item.title} · {item.credit?.artist}</option>)}
        </optgroup>
        <optgroup label="Communauté">
          {community.length ? community.map(item => <option key={item.id} value={item.id}>{item.title} · {item.author}</option>)
            : <option disabled>Aucun son partagé</option>}
        </optgroup>
      </select>
    </label>
    {previewUrl && <audio key={id} src={previewUrl} className="w-full" controls preload="none" aria-label="Aperçu du morceau" />}
    {track?.credit && <StoryMusicCredit track={track} />}
    <CommunityMusicUpload />
  </div>;
}

function StoryMusicCredit({ track }: { track: StoryTrack }) {
  if (!track.credit) return null;
  return <span className="story-music-credit text-xs">
    Extrait de « {track.title} » · <a className="underline" href={track.credit.source} target="_blank" rel="noreferrer">{track.credit.artist}</a>
    {' · '}<a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
  </span>;
}

function CommunityMusicUpload() {
  const { add, upload, user, name } = useCrew();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File>();
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user) return <p className="text-sm text-muted-foreground">Connecte-toi pour partager un son avec la communauté.</p>;

  async function shareSound() {
    if (!file || !title.trim() || !rights || busy) return;
    const extension = file.name.split('.').at(-1)?.toLowerCase();
    if (!extension || !['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac', 'webm'].includes(extension) ||
      (file.type && !file.type.startsWith('audio/')) || file.size < 1 || file.size > 15 * 1024 * 1024) {
      toast.error('Choisis un fichier audio valide de 15 Mo maximum.');
      return;
    }
    setBusy(true);
    try {
      const path = await upload(file, extension, 'story-audio');
      await add('story-audio', { path, title: title.trim(), author: name });
      setTitle('');
      setFile(undefined);
      setRights(false);
      toast.success('Son ajouté à la catégorie Communauté.');
    } catch { toast.error('Le son n’a pas pu être partagé.'); }
    finally { setBusy(false); }
  }

  return <details className="rounded-lg border border-border p-3">
    <summary className="cursor-pointer text-sm font-semibold">Importer un son dans Communauté</summary>
    <div className="mt-3 grid gap-2 text-sm">
      <label className="grid gap-1">Titre<input value={title} onChange={event => setTitle(event.currentTarget.value)} maxLength={80} /></label>
      <label className="grid gap-1">Fichier audio<input key={file ? 'selected' : 'empty'} type="file" accept="audio/*" onChange={event => setFile(event.currentTarget.files?.[0])} /></label>
      {file && <p className="break-all">{file.name}</p>}
      <label className="flex items-start gap-2"><input type="checkbox" checked={rights} onChange={event => setRights(event.currentTarget.checked)} />
        J’ai le droit de partager ce son et d’autoriser les membres à l’utiliser dans leurs stories.
      </label>
      <Button type="button" variant="outline" disabled={busy || !file || !title.trim() || !rights} onClick={() => void shareSound()}>
        {busy ? 'Importation…' : 'Partager le son'}
      </Button>
    </div>
  </details>;
}

function StoryViewer({ item, community, close, download }: { item: MediaItem; community?: CommunityTrack | undefined; close: () => void; download: () => Promise<void> }) {
  const [audio, setAudio] = useState('');
  const [menu, setMenu] = useState(false);
  const track = storyTracks.find(entry => entry.id === item.musicId);
  useEffect(() => {
    const path = community?.path ?? item.music;
    if (!path || track) return;
    let active = true;
    void resolveMedia(path).then(url => { if (active) setAudio(url); }).catch(() => {});
    return () => { active = false; };
  }, [item.music, track, community?.path]);
  const gps = item.gps;
  return <DialogContent fullscreen hideCloseButton className="story-viewer">
    <DialogTitle className="sr-only">Story de {item.authorName}</DialogTitle>
    <DialogDescription className="sr-only">{item.title}</DialogDescription>
    {item.video ? <video src={item.url} autoPlay muted playsInline controls /> : <img src={item.url} alt={item.title} />}
    <header className="story-header">
      <Avatar userId={item.author} pilot={(item.authorName || 'M').charAt(0).toUpperCase()} />
      <strong className="mr-auto truncate">{item.authorName || 'Pilote'}</strong>
      <Button size="icon" variant="secondary" aria-label="Options de la story" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal /></Button>
      <Button size="icon" variant="secondary" aria-label="Fermer la story" onClick={close}><X /></Button>
    </header>
    {menu && <div className="story-menu">
      <Button size="sm" variant="secondary" onClick={() => void download()}><Download /> Télécharger</Button>
      {item.place && <p>{item.place}</p>}
      {gps && <a className="underline" href={'https://www.openstreetmap.org/?mlat=' + gps[0] + '&mlon=' + gps[1]}>Voir le lieu</a>}
      {item.link && <a className="underline" href={item.link} target="_blank" rel="noopener noreferrer">Ouvrir le lien</a>}
    </div>}
    <div className="story-caption">
      {item.description && <p>{item.description}</p>}
      {track ? <div className="story-music">{track.credit ? <StoryMusicCredit track={track} /> : <span>♫ {track.title}</span>}<audio src={storyTrackUrl(track)} autoPlay loop controls aria-label={'Musique de la story · ' + track.title} /></div>
        : audio && <div className="story-music">{community && <span>♫ {community.title}</span>}
          <audio src={audio} controls autoPlay={Boolean(community)} loop={Boolean(community)} aria-label="Musique de la story" /></div>}
    </div>
  </DialogContent>;
}

function MediaActions({ item }: { item: MediaItem }) {
  const { records, add, user, name } = useCrew();
  const [commenting, setCommenting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [liking, setLiking] = useState(false);
  const activity = records.filter(record => record.payload['post'] === item.id);
  const likes = new Map<string, boolean>();
  for (const record of activity) {
    if (record.kind === 'media-like') likes.set(record.author_id ?? 'demo', record.payload['liked'] === true);
  }
  const liked = likes.get(user?.id ?? 'demo') === true;
  const total = [...likes.values()].filter(Boolean).length;
  const comments = activity.filter(record => record.kind === 'media-comment');

  async function toggleLike() {
    if (liking) return;
    setLiking(true);
    try { await add('media-like', { post: item.id, liked: !liked }); }
    catch { toast.error('Le like n’a pas été enregistré.'); }
    finally { setLiking(false); }
  }

  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get('comment') ?? '').trim();
    if (!text || busy) return;
    setBusy(true);
    try { await add('media-comment', { post: item.id, text, name }); form.reset(); }
    catch { toast.error('Le commentaire n’a pas été publié.'); }
    finally { setBusy(false); }
  }

  async function share() {
    const url = new URL('/medias', window.location.origin);
    url.searchParams.set('post', item.id);
    try {
      if (navigator.share) await navigator.share({ title: item.title, url: url.href });
      else { await navigator.clipboard.writeText(url.href); toast.success('Lien copié.'); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('Le lien n’a pas pu être partagé.');
    }
  }

  return <div className="mt-3 border-t border-border pt-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="ghost" aria-pressed={liked} aria-label={liked ? 'Retirer le like' : 'Aimer'} disabled={liking} onClick={toggleLike}>
        <Heart className={liked ? 'fill-primary text-primary' : ''} /> {total}
      </Button>
      <Button size="sm" variant="ghost" aria-label="Commentaires" aria-expanded={commenting} onClick={() => setCommenting(!commenting)}><MessageCircle /> {comments.length}</Button>
      {user && <Button size="sm" variant="ghost" onClick={share}><Share2 /> Partager</Button>}
    </div>
    {commenting && <div className="grid gap-2 py-2">
      {comments.map(record => <p key={record.id} className="break-words text-sm">
        <strong>{String(record.payload['name'] || 'Pilote')}</strong> {String(record.payload['text'] || '')}
      </p>)}
      <form className="flex flex-wrap gap-2" onSubmit={comment}>
        <input className="min-w-0 flex-1" name="comment" maxLength={400} placeholder="Un commentaire…" aria-label="Ton commentaire" required />
        <Button size="sm" disabled={busy}>Envoyer</Button>
      </form>
    </div>}
  </div>;
}
