import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { ClientOnly } from '@tanstack/react-router';
import { ArrowRight, Layers, Navigation, Upload, MapPin, Route, LocateFixed, Signpost, Share2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CrewShell } from './shell';
import { useCrew } from './context';
import { readGpx } from './data';
import { readSegments } from './tracks';
import { livePilots } from './live-location';
import type { RoutePreference, SuggestedRide } from './valhalla.server';
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
  const [view, setView] = useState<'locate' | 'route'>('locate');
  const locating = view === 'locate';
  const [focus, setFocus] = useState(0);
  const [devicePosition, setDevicePosition] = useState<{ lat: number; lng: number; accuracy: number }>();
  useEffect(() => {
    let active = true;
    navigator.geolocation?.getCurrentPosition(({ coords }) => {
      if (active) setDevicePosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
    }, () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    return () => { active = false; };
  }, []);
  const [points, setPoints] = useState<Point[]>([]);
  const [mode, setMode] = useState<'draw' | 'mark' | 'route-start' | 'route-end' | 'route-via'>();
  const [pin, setPin] = useState<Point>();
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeStart, setRouteStart] = useState<Point>();
  const [routeEnd, setRouteEnd] = useState<Point>();
  const [via, setVia] = useState<Point[]>([]);
  const maxVia = 6;
  const [preference, setPreference] = useState<RoutePreference>('mixed');
  const [suggested, setSuggested] = useState<SuggestedRide>();
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState('all');
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const nearbyCache = useRef(new Map<string, { expires: number; places: NearbyPlace[] }>());
  const [searching, setSearching] = useState(false);
  const [viewport, setViewport] = useState({ lat: 48.067, lng: 6.862, zoom: 12 });
  const [deletePin, setDeletePin] = useState<{ id: string; label: string }>();
  const [placeError, setPlaceError] = useState(false);
  const hasPlaces = category === 'all' || Object.hasOwn(osmTags, category);
  const radius = viewport.zoom < 12 ? 18000 : viewport.zoom < 15 ? 6000 : 1250;
  const step = radius / 240000;
  const lat = (Math.round(viewport.lat / step) * step).toFixed(5);
  const lng = (Math.round(viewport.lng / step) * step).toFixed(5);
  const showPlaces = locating && hasPlaces && viewport.zoom >= 10;
  const sharedPosition = sharing && user ? livePilots(records.filter(record => record.author_id === user.id), positionClock)[0] : undefined;
  const ownPosition = sharedPosition ?? devicePosition;
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
    ...(ownPosition ? [{ ...ownPosition, live: true, current: true, label: 'Ta position' }] : []),
    ...(showPlaces ? nearby : []).filter(place => category === 'all' || place.category === category).map(place => ({ ...place, live: false })),
  ];
  const routeMarkers = [
    ...(routeStart ? [{ lat: routeStart[0], lng: routeStart[1], label: 'Départ', category: 'other', color: '#15803d' }] : []),
    ...via.map(([lat, lng], index) => ({ lat, lng, label: 'Passage ' + (index + 1), badge: String(index + 1), color: '#2563eb' })),
    ...(routeEnd ? [{ lat: routeEnd[0], lng: routeEnd[1], label: 'Destination', category: 'rasso', color: '#dc2626' }] : []),
  ];
  const sharedPaths = category === 'all' ? records.filter(record => record.kind === 'ride-track' && record.payload['communityTrail'] === true).map(record => ({
    label: 'Chemin partagé par ' + String(record.payload['pilot'] || 'un pilote'), segments: readSegments(record.payload['segments']),
  })).filter(path => path.segments.length) : [];
  const sharedRoutes = records.filter(record => record.kind === 'route');

  useEffect(() => {
    setSearching(false);
    setPlaceError(false);
    const key = [category, lat, lng, radius].join(':');
    const cached = nearbyCache.current.get(key);
    const valid = cached && cached.expires > Date.now();
    if (showPlaces && valid) setNearby(cached.places);
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

  async function calculateRoute() {
    const start = routeStart ?? (devicePosition ? [devicePosition.lat, devicePosition.lng] : undefined);
    if (!start || !routeEnd || routeBusy) return;
    setRouteBusy(true);
    setRouteError('');
    try {
      const response = await fetch('/api/moto-route', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end: routeEnd, preference, via }),
      });
      if (!response.ok) {
        const { error } = await response.json() as { error?: string };
        setRouteError(error === 'disabled' ? 'Le calcul Valhalla est en attente d’activation.' : error === 'no-route'
          ? 'Aucun itinéraire moto trouvé entre ces deux points.' : error === 'unreachable-via' ? 'Impossible de relier tous les points à moto. Déplace le repère vers une voie accessible, ou retire-le.' : error === 'busy'
            ? 'Le service gratuit est occupé. Réessaie dans un instant.' : 'Le calcul est indisponible pour le moment.');
        return;
      }
      const route = await response.json() as SuggestedRide;
      setSuggested(route);
    } catch { setRouteError('Le calcul est indisponible pour le moment.'); }
    finally { setRouteBusy(false); }
  }

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
    <CrewShell tab="Plan">
      <div className="map-view-tabs" aria-label="Vues du plan">
        <Button size="sm" variant={locating ? 'default' : 'outline'} aria-pressed={locating} onClick={() => { setView('locate'); setMode(undefined); }}><LocateFixed /> Localiser</Button>
        <Button size="sm" variant={!locating ? 'default' : 'outline'} aria-pressed={!locating} onClick={() => { setView('route'); setMode(undefined); }}><Signpost /> Itinéraire</Button>
      </div>
      <section className="map-screen" aria-label="Carte des sorties">
        <ClientOnly fallback={<div className="map-canvas bg-secondary grid place-items-center">Chargement de la carte…</div>}>
          <Suspense fallback={<div className="map-canvas bg-secondary" />}>
            <MapView points={locating ? (category === 'location' && !mode ? noPoints : points) : (suggested?.points ?? noPoints)} markers={locating ? markers : [...markers.filter(marker => marker.live), ...routeMarkers]} paths={locating ? sharedPaths : []} focus={focus} initialPosition={devicePosition} onCenter={(lat, lng, zoom) => setViewport({ lat, lng, zoom })} onPoint={(lat, lng) => {
              if (mode === 'draw') setPoints(current => [...current, [lat, lng]]);
              if (mode === 'mark') { setPin([lat, lng]); setMode(undefined); }
              if (mode === 'route-start' || mode === 'route-end' || mode === 'route-via') {
                if (mode === 'route-start') setRouteStart([lat, lng]);
                else if (mode === 'route-end') setRouteEnd([lat, lng]);
                else setVia(current => current.length < maxVia ? [...current, [lat, lng]] : current);
                const keepAdding = mode === 'route-via' && via.length + 1 < maxVia;
                if (!keepAdding) setMode(undefined);
                setSuggested(undefined);
                setRouteError('');
                if (mode !== 'route-via') setRouteOpen(true);
              }
            }} />
          </Suspense>
        </ClientOnly>
        {locating ? <div className="map-categories">
          <select aria-label="Catégorie de lieux" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="all">Tous les lieux</option>
            <option value="location">Localisation seulement</option>
            {categories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {hasPlaces && (!showPlaces || searching || placeError) && <span role="status" className="map-place-status">
            {!showPlaces ? 'Zoome pour afficher les lieux OpenStreetMap.' : placeError ? 'Lieux OpenStreetMap indisponibles.' : 'Chargement des lieux…'}
          </span>}
        </div> : <div className="map-categories">
          <Button size="sm" variant="secondary" onClick={() => { setMode(undefined); setRouteOpen(true); }}><Signpost />{suggested ? 'Détails de l’itinéraire' : 'Préparer un itinéraire'}</Button>
        </div>}
        <div className="map-tools" aria-label="Outils de la carte">
          {locating && user && !sharing && <div className="map-share-tip" role="status">
            <span>Partage ta position pour que tes amis puissent te rejoindre.</span>
            <ArrowRight size={18} aria-hidden="true" />
          </div>}
          {locating && user && <Button size="icon" aria-pressed={sharing} variant={sharing ? 'default' : 'secondary'} aria-label={sharing ? 'Arrêter le partage de position' : 'Partager ma position'} title={sharing ? 'Arrêter le partage' : 'Partager ma position'} onClick={() => {
            if (!navigator.geolocation) { toast.error('Position indisponible.'); return; }
            setSharing(!sharing);
          }}><Navigation /></Button>}
          <Button size="icon" variant="secondary" title="Voir les positions" aria-label="Voir les positions" disabled={!markers.some(marker => marker.live)} onClick={() => setFocus(value => value + 1)}><LocateFixed /></Button>
          <Button size="icon" variant={aerial ? 'default' : 'secondary'} title={aerial ? 'Vue plan' : 'Vue satellite'} aria-label={aerial ? 'Afficher le plan' : 'Afficher la vue satellite'} aria-pressed={aerial} onClick={() => setAerial(!aerial)}><Layers /></Button>
          {!locating && <>
            <Button size="icon" variant={mode === 'route-via' ? 'default' : 'secondary'} aria-pressed={mode === 'route-via'}
              title="Ajouter des points de passage" aria-label="Ajouter des points de passage" disabled={routeBusy || via.length >= maxVia}
              onClick={() => setMode(mode === 'route-via' ? undefined : 'route-via')}><MapPin /></Button>
            {via.length > 0 && <Button size="icon" variant="secondary" title="Retirer le dernier point" aria-label="Retirer le dernier point"
              disabled={routeBusy} onClick={() => { setVia(current => current.slice(0, -1)); setSuggested(undefined); setRouteError(''); }}><Undo2 /></Button>}
          </>}
          {locating && <>
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
          </>}
        </div>
        {!locating && (routeEnd || via.length > 0 || mode === 'route-via') && <div className="map-categories map-route-actions">
          <span className="map-place-status">{via.length}/{maxVia} points</span>
          <Button size="sm" disabled={routeBusy || !routeEnd || !(routeStart || devicePosition)} onClick={() => { setMode(undefined); void calculateRoute(); }}>{routeBusy ? 'Calcul…' : 'Calculer'}</Button>
          {suggested && <span className="map-place-status">{suggested.km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km · {Math.max(1, Math.round(suggested.seconds / 60))} min</span>}
        </div>}
        {!locating && routeError && !routeOpen && <p className="map-status" role="alert">{routeError}</p>}
        {(mode || locating && (sharing || sharedRoutes.length > 0 && category !== 'location')) && <div className="map-status">
          {locating && sharing && <p>Position partagée avec les membres connectés.</p>}
          {mode && <p>{mode === 'draw' ? 'Touche la carte pour tracer ton parcours.' : mode === 'route-start' ? 'Touche la carte pour choisir le départ.' : mode === 'route-end' ? 'Touche la carte pour choisir la destination.' : mode === 'route-via' ? 'Touche les chemins pour poser tes points. Appuie à nouveau sur la punaise pour terminer.' : 'Touche la carte pour placer le repère.'}</p>}
          {locating && category !== 'location' && sharedRoutes.length > 0 && <select aria-label="Parcours partagés" value="" onChange={event => {
            const record = sharedRoutes.find(item => item.id === event.target.value);
            if (record) setPoints(record.payload['points'] as Point[]);
          }}>
            <option value="" disabled>Parcours partagés</option>
            {sharedRoutes.map((record, index) => <option key={record.id} value={record.id}>{String(record.payload['name'])} · {index + 1}</option>)}
          </select>}
        </div>}
      </section>
      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Itinéraire moto</DialogTitle>
          <DialogDescription>Choisis une destination sur la carte. Le calcul envoie les points au serveur de démo Valhalla.</DialogDescription>
          <div className="grid gap-2 text-sm">
            <Button variant="outline" disabled={routeBusy} onClick={() => { setMode('route-start'); setRouteOpen(false); }}>
              {routeStart ? 'Modifier le départ' : devicePosition ? 'Départ depuis ta position · modifier' : 'Choisir le départ'}
            </Button>
            {routeStart && devicePosition && <Button variant="ghost" size="sm" disabled={routeBusy} onClick={() => { setRouteStart(undefined); setSuggested(undefined); }}>Partir de ma position</Button>}
            <Button variant="outline" disabled={routeBusy} onClick={() => { setMode('route-end'); setRouteOpen(false); }}>
              {routeEnd ? 'Modifier la destination' : 'Choisir la destination sur la carte'}
            </Button>
            {via.length > 0 && <ol className="grid gap-1" aria-label="Points de passage">
              {via.map(([lat, lng], index) => <li key={index} className="flex items-center justify-between gap-2">
                <span>{index + 1}. {lat.toFixed(5)}, {lng.toFixed(5)}</span>
                <Button variant="ghost" size="sm" disabled={routeBusy} onClick={() => {
                  setVia(current => current.filter((_, position) => position !== index));
                  setSuggested(undefined);
                  setRouteError('');
                }} aria-label={'Retirer le point de passage ' + (index + 1)}>Retirer</Button>
              </li>)}
            </ol>}
            <label className="grid gap-1">Type de trajet
              <select value={preference} disabled={routeBusy} onChange={event => { setPreference(event.target.value as RoutePreference); setSuggested(undefined); }}>
                <option value="road">Route privilégiée</option>
                <option value="mixed">Mixte</option>
                <option value="trails">Chemins privilégiés</option>
              </select>
            </label>
            <Button disabled={routeBusy || !routeEnd || !(routeStart || devicePosition)} onClick={() => void calculateRoute()}>{routeBusy ? 'Calcul…' : 'Calculer'}</Button>
            {routeError && <p role="alert">{routeError}</p>}
            {suggested && <>
              <p className="font-semibold">{suggested.km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km · {Math.max(1, Math.round(suggested.seconds / 60))} min</p>
              <Button variant="outline" onClick={() => setRouteOpen(false)}>Voir sur la carte</Button>
              <ol className="grid list-decimal gap-1 pl-5">{suggested.directions.map((step, index) => <li key={index}>{step}</li>)}</ol>
            </>}
            <p className="text-xs text-muted-foreground">En mode Chemins privilégiés, Valhalla peut choisir la route. La punaise au bord de la carte permet de placer tes passages sur les chemins ouverts aux motos.</p>
            <p className="text-xs text-muted-foreground">Calcul Valhalla · FOSSGIS · <a className="underline" href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a></p>
          </div>
        </DialogContent>
      </Dialog>
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
