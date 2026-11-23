import { lazy, Suspense, useState, type FormEvent } from 'react';
import { ClientOnly } from '@tanstack/react-router';
import { ArrowRight, Layers, Navigation, Upload, MapPin, Route, LocateFixed, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CrewShell } from './shell';
import { useCrew } from './context';
import { readGpx } from './data';
import { toast } from 'sonner';

const MapView = lazy(() => import('./map-view'));
type Point = [number, number];

export function MapPage() {
  const { records, add, user, sharing, setSharing, positionClock, aerial, setAerial } = useCrew();
  const [focus, setFocus] = useState(0);
  const [points, setPoints] = useState<Point[]>([]);
  const [mode, setMode] = useState<'draw' | 'mark'>();
  const [pin, setPin] = useState<Point>();
  const [saving, setSaving] = useState(false);
  const markers = [
    ...(!user ? [{ lat: 48.065, lng: 6.863, label: 'Parking du lac · Démo', live: false }] : []),
    ...records.filter(record => record.kind === 'marker' || (record.kind === 'live-position' &&
      positionClock > 0 && Number(record.payload['expires']) > positionClock)).map(record => ({
      lat: Number(record.payload['lat']), lng: Number(record.payload['lng']),
      label: String(record.payload['label']), live: record.kind === 'live-position',
    })),
  ];
  const sharedRoutes = records.filter(record => record.kind === 'route');

  async function savePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pin || saving) return;
    const label = String(new FormData(event.currentTarget).get('label') ?? '').trim();
    if (!label) return;
    setSaving(true);
    try {
      await add('marker', { lat: pin[0], lng: pin[1], label });
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
            <MapView points={points} markers={markers} focus={focus} onPoint={(lat, lng) => {
              if (mode === 'draw') setPoints(current => [...current, [lat, lng]]);
              if (mode === 'mark') { setPin([lat, lng]); setMode(undefined); }
            }} />
          </Suspense>
        </ClientOnly>
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
        {(mode || sharing || sharedRoutes.length > 0) && <div className="map-status">
          {sharing && <p>Position partagée avec les membres connectés.</p>}
          {mode && <p>{mode === 'draw' ? 'Touche la carte pour tracer ton parcours.' : 'Touche la carte pour placer le repère.'}</p>}
          {sharedRoutes.length > 0 && <select aria-label="Parcours partagés" value="" onChange={event => {
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
          <DialogDescription>Donne un nom à cet endroit sur la carte.</DialogDescription>
          <form className="grid gap-3" onSubmit={savePin}>
            <input name="label" placeholder="Ex. Rendez-vous au parking" aria-label="Nom du repère" maxLength={80} required />
            <Button disabled={saving}>Enregistrer le repère</Button>
          </form>
        </DialogContent>
      </Dialog>
    </CrewShell>
  );
}
