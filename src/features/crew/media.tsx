import { useEffect, useState, type FormEvent } from 'react';
import { Download, Images, MapPin, Play, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CrewShell } from './shell';
import { useCrew, resolveMedia } from './context';
import { images } from './data';
import { toast } from 'sonner';
import { socialCall } from './social';
import { jpeg, loadPhoto } from './photo-crop';
import { photoGps } from './photo-gps';
import type { TrackPoint } from './tracks';

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
};

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

export function MediaPage({ initialRide }: { initialRide?: string | undefined }) {
  const { user } = useCrew();
  return <MediaGallery key={(user?.id ?? 'demo') + (initialRide ?? '')} initialRide={initialRide} />;
}

function MediaGallery({ initialRide }: { initialRide: string | undefined }) {
  const { records, add, upload, user, refresh } = useCrew();
  const [visibility, setVisibility] = useState('public');
  const [filter, setFilter] = useState('Toutes les sorties');
  const [sort, setSort] = useState('recent');
  const [selected, setSelected] = useState<MediaItem>();
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState<MediaItem[]>([]);
  const [publishing, setPublishing] = useState(Boolean(initialRide));
  const [files, setFiles] = useState<File[]>([]);
  const rides = records.filter(record => record.kind === 'ride-track').slice().reverse();

  useEffect(() => {
    let active = true;
    const media = records.filter(record => record.kind === 'media');
    void Promise.allSettled(media.map(async ({ id, payload }): Promise<MediaItem> => ({
      id, url: await resolveMedia(String(payload['preview'])), original: String(payload['original']),
      title: String(payload['title']), date: String(payload['date']), session: String(payload['session']),
      video: Boolean(payload['video']), visibility: String(payload['visibility'] ?? 'public'),
      description: String(payload['description'] ?? ''), place: String(payload['place'] ?? ''), gps: coordinates(payload['gps']),
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

  const all = [...(user ? [] : demo), ...extra];
  const items = all.filter(item => filter === 'Toutes les sorties' || item.session === filter)
    .sort((a, b) => sort === 'recent' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !files.length) return;
    const fields = new FormData(event.currentTarget);
    const description = String(fields.get('description') ?? '').trim();
    const place = String(fields.get('place') ?? '').trim();
    const ride = rides.find(item => item.id === fields.get('ride'));
    const includeGps = fields.has('gps');
    setBusy(true);
    try {
      if (files.some(file => file.size > 50 * 1024 * 1024)) throw new Error('Un fichier dépasse 50 Mo.');
      if (user && visibility === 'friends') await socialCall('mybike_friends_list', {});
      const folder = visibility === 'friends' ? 'friends' : undefined;
      for (const file of files) {
        const video = file.type.startsWith('video/');
        const extension = file.name.split('.').at(-1)?.match(/^[a-z\d]{1,8}$/i)?.[0] ?? (video ? 'mp4' : 'jpg');
        const gps = includeGps && !video ? await photoGps(file) : undefined;
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
        const original = await upload(file, extension, folder);
        const preview = previewBlob ? await upload(previewBlob, 'jpg', folder) : original;
        await add('media', {
          original, preview, title: file.name, date: new Date().toISOString().slice(0, 10),
          session: ride ? String(ride.payload['name'] ?? 'Parcours') : 'Nouvelle sortie',
          video, visibility, description, place, ...(gps ? { gps } : {}), ...(ride ? { rideId: ride.id } : {}),
        });
        setFiles(pending => pending.filter(item => item !== file));
      }
      setPublishing(false);
      toast.success('Médias publiés.');
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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-semibold"><Images className="text-primary" /> L’album du groupe · {items.length} souvenirs</h2>
      <Button onClick={() => setPublishing(true)}><Upload /> Ajouter des médias</Button>
    </div>
    <div className="mb-6 flex flex-wrap justify-between gap-3">
      <select aria-label="Filtrer par sortie" value={filter} onChange={event => setFilter(event.target.value)}>
        {['Toutes les sorties', ...new Set(all.map(item => item.session))].map(session => <option key={session}>{session}</option>)}
      </select>
      <select aria-label="Trier par date" value={sort} onChange={event => setSort(event.target.value)}>
        <option value="recent">Plus récentes</option><option value="old">Plus anciennes</option>
      </select>
    </div>
    <div className="media-grid">{items.map(item => <article key={item.id}>
      <Button variant="ghost" className="relative h-auto w-full overflow-hidden p-0" onClick={() => setSelected(item)} aria-label={'Voir ' + item.title}>
        {item.video ? <><video className="media-photo" src={item.url} /><Play className="absolute" /></> : <img src={item.url} alt={item.title} className="media-photo" />}
      </Button>
      <h3 className="mt-2 break-words text-sm font-semibold">{item.title}</h3>
      <p className="text-xs text-muted-foreground">{item.visibility === 'friends' && 'Amis seulement · '}{item.place || item.session} · {new Date(item.date).toLocaleDateString('fr-FR')}</p>
      {item.description && <p className="mt-1 line-clamp-2 text-sm">{item.description}</p>}
    </article>)}</div>
    <Dialog open={publishing} onOpenChange={open => { if (!busy) setPublishing(open); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle>Publier des médias</DialogTitle>
        <DialogDescription>Ajoute une description et le lieu de la prise de vue.</DialogDescription>
        <form className="grid gap-3" onSubmit={publish}>
          <label className="grid gap-1">Photos ou vidéos<input type="file" className="w-full" accept="image/*,video/*,.heic,.heif" multiple disabled={busy}
            onChange={event => setFiles(Array.from(event.target.files ?? []))} /></label>
          {files.length > 0 && <p className="text-sm text-muted-foreground">{files.length} fichier(s) à publier</p>}
          <label className="grid gap-1">Description<textarea name="description" rows={3} maxLength={600} /></label>
          <label className="grid gap-1">Lieu (facultatif)<input name="place" maxLength={120} placeholder="Ex. Forêt de Clairvaux" /></label>
          {rides.length > 0 && <label className="grid gap-1">Associer à un parcours
            <select name="ride" defaultValue={initialRide ?? ''}><option value="">Aucun parcours</option>
              {rides.map(ride => <option key={ride.id} value={ride.id}>{String(ride.payload['name'] ?? 'Parcours')}</option>)}
            </select>
          </label>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="gps" /> Afficher les coordonnées GPS des photos JPEG qui en contiennent</label>
          {user && <label className="grid gap-1">Visibilité<select value={visibility} onChange={event => setVisibility(event.target.value)} disabled={busy}>
            <option value="public">Public sur MYbike</option><option value="friends">Amis seulement</option>
          </select></label>}
          <Button disabled={busy || !files.length}>{busy ? 'Publication…' : 'Publier'}</Button>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(undefined); }}>
      {selected && <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogTitle>{selected.title}</DialogTitle>
        <DialogDescription>{selected.session}</DialogDescription>
        {selected.video ? <video src={selected.url} controls className="w-full max-h-[60vh]" /> : <img src={selected.url} alt={selected.title} className="w-full max-h-[60vh] object-contain" />}
        {selected.description && <p className="whitespace-pre-wrap break-words">{selected.description}</p>}
        {selected.place && <p className="flex items-center gap-2"><MapPin size={16} />{selected.place}</p>}
        {selected.gps && <a className="underline" href={'https://www.openstreetmap.org/?mlat=' + selected.gps[0] + '&mlon=' + selected.gps[1] + '#map=16/' + selected.gps[0] + '/' + selected.gps[1]}>Voir le lieu sur la carte</a>}
        <Button onClick={download}><Download /> Télécharger l’original</Button>
      </DialogContent>}
    </Dialog>
  </CrewShell>;
}
