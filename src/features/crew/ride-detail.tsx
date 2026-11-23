import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ImagePlus, LocateFixed, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CrewShell } from './shell';
import { resolveMedia, useCrew } from './context';
import { TrackMap } from './rides';
import { kilometers, metersFromRoute, readSegments, readStops, type TrackPoint } from './tracks';
import type { CrewRecord } from './data';

export function RideDetailPage({ rideId }: { rideId: string }) {
  const { records, loading } = useCrew();
  const ride = records.find(record => record.id === rideId && record.kind === 'ride-track');
  const photos = records.filter(record => record.kind === 'media' && record.payload['rideId'] === rideId && !record.payload['video']);
  return <CrewShell tab="Parcours">
    <div className="mx-auto grid max-w-5xl gap-4">
      <Button asChild variant="outline" size="icon" className="rounded-full"><Link to="/parcours" aria-label="Retour aux parcours"><ArrowLeft /></Link></Button>
      {ride ? <RideDetail key={ride.id} ride={ride} photos={photos} /> : <p>{loading ? 'Chargement du parcours…' : 'Ce parcours est introuvable. Connecte-toi si un pilote te l’a partagé.'}</p>}
    </div>
  </CrewShell>;
}

function RideDetail({ ride, photos }: { ride: CrewRecord; photos: CrewRecord[] }) {
  const { payload } = ride;
  const segments = useMemo(() => readSegments(payload['segments']), [payload]);
  const stops = useMemo(() => readStops(payload['stops']), [payload]);
  const [following, setFollowing] = useState(false);
  const [position, setPosition] = useState<{ point: TrackPoint; accuracy: number }>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!following) return;
    if (!navigator.geolocation) { setError('GPS indisponible sur cet appareil.'); setFollowing(false); return; }
    let active = true;
    const id = navigator.geolocation.watchPosition(({ coords }) => {
      if (active) {
        setPosition({ point: [coords.latitude, coords.longitude], accuracy: coords.accuracy });
        setError('');
      }
    }, failure => {
      if (!active) return;
      setError(failure.code === 1 ? 'Autorise la localisation pour suivre la trace.' : 'En attente d’un meilleur signal GPS.');
      if (failure.code === 1) setFollowing(false);
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    return () => { active = false; navigator.geolocation.clearWatch(id); };
  }, [following]);

  const motion = payload['motion'] as { meters?: unknown; milliseconds?: unknown } | undefined;
  const movingTime = Number(motion?.milliseconds);
  const movingDistance = Number(motion?.meters);
  const average = movingTime > 0 && Number.isFinite(movingDistance) ? movingDistance * 3600 / movingTime : undefined;
  const distanceToRoute = position && position.accuracy <= 35 ? metersFromRoute(position.point, segments) : undefined;
  const duration = Math.round((Number(payload['duration']) || 0) / 60000);

  return <>
    <section className="ride-record grid gap-4">
      <header>
        <h2 className="font-display text-4xl font-bold">{String(payload['name'] ?? 'Parcours')}</h2>
        {ride.author_id && <Link to="/pilotes/$pilotId" params={{ pilotId: ride.author_id }} className="text-sm text-muted-foreground underline">{String(payload['pilot'] ?? 'Pilote')}</Link>}
      </header>
      {Boolean(payload['description']) && <p className="whitespace-pre-wrap break-words">{String(payload['description'])}</p>}
      <h3 className="text-lg font-semibold">Bilan de sortie</h3>
      <dl className="weather-details">
        <div><dt>Distance</dt><dd>{kilometers(Number(payload['distance']) || 0)}</dd></div>
        <div><dt>Durée</dt><dd>{duration} min</dd></div>
        <div><dt>Moyenne en mouvement</dt><dd>{average === undefined ? '—' : average.toFixed(1) + ' km/h'}</dd></div>
      </dl>
    </section>
    <section className="ride-record grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Refaire ce parcours</h3>
        <Button disabled={!segments.length} aria-pressed={following} onClick={() => {
          setError('');
          setPosition(undefined);
          setFollowing(!following);
        }}><LocateFixed /> {following ? 'Arrêter le suivi' : 'Suivre la trace'}</Button>
      </div>
      <TrackMap segments={segments} stops={stops} position={following ? position : undefined} follow={following} />
      {(following || error) && <p role="status" className="text-sm text-muted-foreground">
        {error || (!position ? 'Recherche de ta position…' : distanceToRoute === undefined || !Number.isFinite(distanceToRoute)
          ? 'Signal GPS trop faible pour estimer l’écart à la trace.'
          : Math.round(distanceToRoute) + ' m de la trace · précision ± ' + Math.round(position.accuracy) + ' m')}
      </p>}
      {stops.length > 0 && <section><h4 className="mb-2 font-semibold">Repères</h4><ul className="grid gap-2">{stops.map((stop, index) =>
        <li key={index} className="flex items-center gap-2"><MapPin size={16} />{stop.label}</li>)}</ul></section>}
    </section>
    <section className="ride-record grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Photos de la sortie</h3>
        <Button asChild variant="outline"><Link to="/medias" search={{ ride: ride.id }}><ImagePlus /> Ajouter des photos</Link></Button>
      </div>
      {photos.length ? <div className="media-grid">{photos.map(photo => <RidePhoto key={photo.id} photo={photo} />)}</div>
        : <p className="text-muted-foreground">Aucune photo associée à ce parcours.</p>}
    </section>
  </>;
}

function RidePhoto({ photo }: { photo: CrewRecord }) {
  const [url, setUrl] = useState('');
  const path = String(photo.payload['preview'] ?? '');
  useEffect(() => {
    if (!path) return;
    let active = true;
    void resolveMedia(path).then(value => { if (active) setUrl(value); }).catch(() => {});
    return () => { active = false; };
  }, [path]);
  if (!url) return null;
  const caption = String(photo.payload['description'] || photo.payload['title'] || 'Photo de la sortie');
  return <figure><img src={url} className="media-photo" loading="lazy" alt={caption} /><figcaption className="mt-1 text-sm">{caption}</figcaption></figure>;
}
