import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { ClientOnly } from '@tanstack/react-router';
import { ArrowRight, Layers, Navigation, Upload, MapPin, Route, LocateFixed, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CrewShell } from './shell';
import { useCrew } from './context';
import { readGpx } from './data';
import { readSegments } from './tracks';
import { livePilots } from './live-location';
import { toast } from 'sonner';

const noPoints: Point[] = [];
const MapView = lazy(() => import('./map-view'));
type Point = [number, number];
const categories = [
  { id: 'event', label: 'Événements', color: '#dc2626' },
  { id: 'fuel', label: 'Essence', color: '#d97706' },
  { id: 'charging', label: 'Recharge', color: '#7c3aed' },
  { id: 'parking', label: 'Parking', color: '#2563eb' },
  { id: 'other', label: 'Autres repères', color: '#475569' },
] as const;
const osmTags = { fuel: 'fuel', charging: 'charging_station', parking: 'parking' } as const;
type NearbyPlace = { lat: number; lng: number; label: string; color: string; category: string };

export function MapPage() {
  const { records, add, remove, user, sharing, setSharing, positionClock, aerial, setAerial } = useCrew();
  const [focus, setFocus] = useState(0);
  const [points, setPoints] = useState<Point[]>([]);
  const [mode, setMode] = useState<'draw' | 'mark'>();
  const [pin, setPin] = useState<Point>();
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState('all');
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const nearbyCache = useRef(new Map<string, { expires: number; places: NearbyPlace[] }>());
  const [searching, setSearching] = useState(false);
  const [viewport, setViewport] = useState({ lat: 48.067, lng: 6.862, zoom: 12 });
  const [deletePin, setDeletePin] = useState<{ id: string; label: string }>();
  const [placeError, setPlaceError] = useState(false);
  const hasPlaces = category === 'all' || Object.hasOwn(osmTags, category);
  const radius = Math.min(18000, Math.round(6000 * 2 ** (12 - viewport.zoom)));
  const step = radius / 240000;
  const lat = (Math.round(viewport.lat / step) * step).toFixed(5);
  const lng = (Math.round(viewport.lng / step) * step).toFixed(5);
  const showPlaces = hasPlaces && viewport.zoom >= 10;
  const markers = [
    ...(!user && (category === 'all' || category === 'parking') ? [{ lat: 48.065, lng: 6.863, label: 'Parking du lac · Démo', color: '#2563eb', category: 'parking', live: false }] : []),
    ...records.filter(record => record.kind === 'marker' && (category === 'all' || (record.payload['category'] ?? 'other') === category)).map(record => ({
      lat: Number(record.payload['lat']), lng: Number(record.payload['lng']),
      label: String(record.payload['label']), live: false,
      category: String(record.payload['category'] ?? 'other'),
      onRemove: (user ? record.author_id === user.id : !record.author_id && /^[0-9a-f-]{36}$/i.test(record.id))
        ? () => setDeletePin({ id: record.id, label: String(record.payload['label']) }) : undefined,
      color: categories.find(item => item.id === record.payload['category'])?.color ?? '#475569',
    })),
    ...((category === 'all' || category === 'event') ? records.flatMap(record => {
      if (record.kind !== 'rasso' || !(Date.parse(String(record.payload['when'])) > Date.now())) return [];
      const point = readSegments([[record.payload['pin']]])[0]?.[0];
      return point ? [{ lat: point[0], lng: point[1], label: String(record.payload['title']), live: false, color: '#dc2626', category: 'rasso', url: '/rasso?id=' + encodeURIComponent(record.id) }] : [];
    }) : []),
    ...livePilots(records, positionClock, user?.id),
    ...(sharing && user ? livePilots(records.filter(record => record.author_id === user.id), positionClock)
      .map(marker => ({ ...marker, current: true, label: 'Ta position' })) : []),
    ...(showPlaces ? nearby : []).filter(place => category === 'all' || place.category === category).map(place => ({ ...place, live: false })),
  ];
  const sharedRoutes = records.filter(record => record.kind === 'route');

  useEffect(() => {
    setSearching(false);
    setPlaceError(false);
    const key = [category, lat, lng, radius].join(':');
    const cached = nearbyCache.current.get(key);
    const valid = cached && cached.expires > Date.now();
    setNearby(showPlaces && valid ? cached.places : []);
    if (!showPlaces || valid) return;
    const request = new AbortController();
    let active = true;
    let timeout = 0;
    const debounce = window.setTimeout(async () => {
      setSearching(true);
      timeout = window.setTimeout(() => request.abort(), 12000);
      try {
        const kinds = (Object.keys(osmTags) as (keyof typeof osmTags)[])
          .filter(kind => category === 'all' || category === kind);
        const queries = kinds.map(kind => `nwr["amenity"="${osmTags[kind]}"](around:${radius},${lat},${lng});out center 100;`);
        const data = '[out:json][timeout:8];' + queries.join('');
        const response = await fetch('https://ovp.dresel.systems/api/interpreter?' + new URLSearchParams({ data }), { signal: request.signal });
        if (!response.ok) throw new Error();
        const json = await response.json() as { remark?: string; elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { amenity?: string; name?: string; brand?: string } }[] };
        if (json.remark) throw new Error();
        const places = (json.elements ?? []).flatMap(place => {
          const latitude = place.lat ?? place.center?.lat;
          const longitude = place.lon ?? place.center?.lon;
          const item = categories.find(entry => kinds.some(kind => kind === entry.id && osmTags[kind] === place.tags?.amenity));
          return !item || latitude === undefined || longitude === undefined ? [] : [{
            lat: latitude, lng: longitude, label: (place.tags?.name || place.tags?.brand || item.label) + ' · OpenStreetMap',
            color: item.color, category: item.id,
          }];
        });
        if (!active) return;
        if (nearbyCache.current.size >= 24) nearbyCache.current.clear();
        nearbyCache.current.set(key, { expires: Date.now() + 300000, places });
        setNearby(places);
      } catch {
        if (active) setPlaceError(true);
      } finally {
        window.clearTimeout(timeout);
        if (active) setSearching(false);
      }
    }, 850);
    return () => {
      active = false;
      window.clearTimeout(debounce);
      window.clearTimeout(timeout);
      request.abort();
    };
  }, [category, lat, lng, radius, showPlaces]);

  async function savePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pin || saving) return;
    const form = new FormData(event.currentTarget);
    const label = String(form.get('label') ?? '').trim();
    const selected = categories.find(item => item.id === form.get('category'))?.id ?? 'other';
    if (!label) return;
    setSaving(true);
    try {
      await add('marker', { lat: pin[0], lng: pin[1], label, category: selected });
      setCategory(selected);
      setPin(undefined);
    } catch {
      toast.error('Impossible d’ajouter le repère.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <CrewShell tab="Localiser">
      <section className="map-screen" aria-label="Carte des sorties">
        <ClientOnly fallback={<div className="map-canvas bg-secondary grid place-items-center">Chargement de la carte…</div>}>
          <Suspense fallback={<div className="map-canvas bg-secondary" />}>
            <MapView points={category === 'location' && !mode ? noPoints : points} markers={markers} focus={focus} onCenter={(lat, lng, zoom) => setViewport({ lat, lng, zoom })} onPoint={(lat, lng) => {
              if (mode === 'draw') setPoints(current => [...current, [lat, lng]]);
              if (mode === 'mark') { setPin([lat, lng]); setMode(undefined); }
            }} />
          </Suspense>
        </ClientOnly>
        <div className="map-categories">
          <select aria-label="Catégorie de lieux" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="all">Tous les lieux</option>
            <option value="location">Localisation seulement</option>
            {categories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {hasPlaces && (!showPlaces || searching || placeError) && <span role="status" className="map-place-status">
            {!showPlaces ? 'Zoome pour afficher les lieux OpenStreetMap.' : placeError ? 'Lieux OpenStreetMap indisponibles.' : 'Chargement des lieux…'}
          </span>}
        </div>
        <div className="map-tools" aria-label="Outils de la carte">
          {user && !sharing && <div className="map-share-tip" role="status">
            <span>Partage ta position pour que tes amis puissent te rejoindre.</span>
            <ArrowRight size={18} aria-hidden="true" />
          </div>}
          {user && <Button size="icon" aria-pressed={sharing} variant={sharing ? 'default' : 'secondary'} aria-label={sharing ? 'Arrêter le partage de position' : 'Partager ma position'} title={sharing ? 'Arrêter le partage' : 'Partager ma position'} onClick={() => {
            if (!navigator.geolocation) { toast.error('Position indisponible.'); return; }
            setSharing(!sharing);
          }}><Navigation /></Button>}
          <Button size="icon" variant="secondary" title="Voir les positions" aria-label="Voir les positions" disabled={!markers.some(marker => marker.live)} onClick={() => setFocus(value => value + 1)}><LocateFixed /></Button>
          <Button size="icon" variant={aerial ? 'default' : 'secondary'} title={aerial ? 'Vue plan' : 'Vue satellite'} aria-label={aerial ? 'Afficher le plan' : 'Afficher la vue satellite'} aria-pressed={aerial} onClick={() => setAerial(!aerial)}><Layers /></Button>
          <Button size="icon" variant="secondary" title="Importer GPX" asChild><label className="cursor-pointer">
            <Upload /><span className="sr-only">Importer GPX</span>
            <input className="sr-only" type="file" accept=".gpx" onChange={async event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              try { setPoints(readGpx(await file.text())); setMode(undefined); }
              catch (error) { toast.error(String(error)); }
            }} />
          </label></Button>
          <Button size="icon" aria-pressed={mode === 'draw'} variant={mode === 'draw' ? 'default' : 'secondary'} title="Tracer" aria-label="Tracer" onClick={() => setMode(mode === 'draw' ? undefined : 'draw')}><Route /></Button>
          <Button size="icon" aria-pressed={mode === 'mark'} variant={mode === 'mark' ? 'default' : 'secondary'} title="Ajouter un repère" aria-label="Ajouter un repère" onClick={() => setMode(mode === 'mark' ? undefined : 'mark')}><MapPin /></Button>
          {points.length > 1 && <Button size="icon" variant="secondary" title="Partager le parcours" aria-label="Partager le parcours" onClick={() => void add('route', { points, name: 'Parcours du groupe' })
            .then(() => toast.success('Parcours partagé.')).catch(() => toast.error('Le parcours n’a pas été partagé.'))}><Share2 /></Button>}
        </div>
        {(mode || sharing || sharedRoutes.length > 0 && category !== 'location') && <div className="map-status">
          {sharing && <p>Position partagée avec les membres connectés.</p>}
          {mode && <p>{mode === 'draw' ? 'Touche la carte pour tracer ton parcours.' : 'Touche la carte pour placer le repère.'}</p>}
          {category !== 'location' && sharedRoutes.length > 0 && <select aria-label="Parcours partagés" value="" onChange={event => {
            const record = sharedRoutes.find(item => item.id === event.target.value);
            if (record) setPoints(record.payload['points'] as Point[]);
          }}>
            <option value="" disabled>Parcours partagés</option>
            {sharedRoutes.map((record, index) => <option key={record.id} value={record.id}>{String(record.payload['name'])} · {index + 1}</option>)}
          </select>}
        </div>}
      </section>
      <Dialog open={Boolean(pin)} onOpenChange={open => { if (!open) setPin(undefined); }}>
        <DialogContent>
          <DialogTitle>Ajouter un repère</DialogTitle>
          <DialogDescription>Publie un lieu sur la carte de la communauté MYbike.</DialogDescription>
          <form className="grid gap-3" onSubmit={savePin}>
            <input name="label" placeholder="Ex. Rendez-vous au parking" aria-label="Nom du repère" maxLength={80} required />
            <label className="grid gap-1">Catégorie<select name="category" defaultValue={categories.find(item => item.id === category)?.id ?? 'other'}>
              {categories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            <Button disabled={saving}>Enregistrer le repère</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(deletePin)} onOpenChange={open => { if (!open && !saving) setDeletePin(undefined); }}>
        <DialogContent>
          <DialogTitle>Supprimer le repère</DialogTitle>
          <DialogDescription>Retirer « {deletePin?.label} » de la carte MYbike ?</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={saving} onClick={() => setDeletePin(undefined)}>Annuler</Button>
            <Button variant="destructive" disabled={saving} onClick={async () => {
              if (!deletePin || saving) return;
              setSaving(true);
              try { await remove(deletePin.id); setDeletePin(undefined); }
              catch { toast.error('Impossible de supprimer le repère.'); }
              finally { setSaving(false); }
            }}>Supprimer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </CrewShell>
  );
}
