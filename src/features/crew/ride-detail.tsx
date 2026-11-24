import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowUp, CornerUpLeft, CornerUpRight, Download, Flag, Gauge, ImagePlus, LocateFixed, MapPin, Maximize, Volume2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadRideGpx, downloadRideMap } from './offline-ride';
import { toast } from 'sonner';
import { CrewShell } from './shell';
import { resolveMedia, useCrew } from './context';
import { DifficultyBadge, RideFavorite, RideStats, TrackMap } from './rides';
import { createRideSpeed } from './ride-speed';
import type { RouteManeuver, SuggestedRide } from './valhalla.server';
import type { livePilots } from './live-location';
import { metersBetween, routeProgress, readSegments, readStops, type TrackPoint } from './tracks';
import { CircuitRecorder, formatLap, LapComparison, LapResults, readLapTimes } from './circuit-recorder';
import type { CrewRecord } from './data';

export function RideDetailPage({ rideId, start = false }: { rideId: string; start?: boolean }) {
  const { records, loading } = useCrew();
  const ride = records.find(record => record.id === rideId && record.kind === 'ride-track');
  const photos = records.filter(record => record.kind === 'media' && record.payload['rideId'] === rideId && !record.payload['video']);
  return <CrewShell tab="Parcours">
    <div className="mx-auto grid max-w-5xl gap-4">
      <Button asChild variant="outline" size="icon" className="rounded-full"><Link to="/parcours" aria-label="Retour aux parcours"><ArrowLeft /></Link></Button>
      {ride ? <RideDetail key={ride.id} ride={ride} photos={photos} start={start} /> : <p>{loading ? 'Chargement du parcours…' : 'Ce parcours est introuvable. Connecte-toi si un pilote te l’a partagé.'}</p>}
    </div>
  </CrewShell>;
}

export function RideDetail({ ride, photos, start, convoy }: {
  ride: CrewRecord; photos: CrewRecord[]; start: boolean;
  convoy?: { target: TrackPoint | undefined; pilots: ReturnType<typeof livePilots>; onClose: () => void; join: boolean; paused: boolean; togglePause?: (() => void) | undefined };
}) {
  const { payload } = ride;
  const { records, add, user } = useCrew();
  const isCircuit = payload['circuit'] === true || readLapTimes(payload['laps']).length > 0;
  const publicCircuit = isCircuit && payload['visibility'] === 'public';
  const [racing, setRacing] = useState(false);
  const [publishingCircuit, setPublishingCircuit] = useState(false);
  const [publishedCopy, setPublishedCopy] = useState(false);
  const originalSegments = useMemo(() => readSegments(payload['segments']), [payload]);
  const [returnRoute, setReturnRoute] = useState<SuggestedRide>();
  const [returning, setReturning] = useState(false);
  const joinRequested = useRef(false);
  const segments = useMemo(() => returnRoute ? [returnRoute.points] : originalSegments, [returnRoute, originalSegments]);
  const stops = useMemo(() => readStops(payload['stops']), [payload]);
  const [following, setFollowing] = useState(start && (segments.length > 0 || Boolean(convoy)));
  const [dashboard, setDashboard] = useState(start && (segments.length > 0 || Boolean(convoy)));
  const [voice, setVoice] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [speed, setSpeed] = useState<number>();
  const lastSpoken = useRef<number | undefined>(undefined);
  const [downloadingMap, setDownloadingMap] = useState(false);
  const title = String(payload['name'] ?? 'Parcours');
  const [position, setPosition] = useState<{ point: TrackPoint; accuracy: number }>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!following) return;
    if (!navigator.geolocation) { setError('GPS indisponible sur cet appareil.'); setFollowing(false); return; }
    let active = true;
    const estimateSpeed = createRideSpeed();
    let timeout: number | undefined;
    const id = navigator.geolocation.watchPosition(({ coords, timestamp }) => {
      if (active) {
        const point: TrackPoint = [coords.latitude, coords.longitude];
        setPosition({ point, accuracy: coords.accuracy });
        window.clearTimeout(timeout);
        setSpeed(estimateSpeed({ point, timestamp, accuracy: coords.accuracy, reported: coords.speed })?.kmh);
        timeout = window.setTimeout(() => setSpeed(undefined), 7000);
        setError('');
      }
    }, failure => {
      if (!active) return;
      setError(failure.code === 1 ? 'Autorise la localisation pour suivre la trace.' : 'En attente d’un meilleur signal GPS.');
      if (failure.code === 1) setFollowing(false);
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    return () => { active = false; window.clearTimeout(timeout); navigator.geolocation.clearWatch(id); };
  }, [following]);

  const motion = payload['motion'] as { meters?: unknown; milliseconds?: unknown } | undefined;
  const movingTime = Number(motion?.milliseconds);
  const movingDistance = Number(motion?.meters);
  const motionStats = movingTime > 0 && Number.isFinite(movingTime) && Number.isFinite(movingDistance)
    ? { milliseconds: movingTime, meters: movingDistance } : undefined;
  const progress = segments.length && position && position.accuracy <= 35 ? routeProgress(position.point, segments) : undefined;
  const distanceToRoute = progress?.distance;
  const offRoute = progress !== undefined && progress.distance > 65;
  const steps = useMemo(() => {
    const points = segments.length === 1 ? segments[0] : undefined;
    const instructions: unknown = returnRoute?.maneuvers ?? payload['maneuvers'];
    if (!points || !Array.isArray(instructions)) return [];
    let traveled = 0;
    const distances = points.map((point, index) => {
      if (index) traveled += metersBetween(points[index - 1]!, point);
      return traveled;
    });
    return instructions.flatMap((step: Partial<RouteManeuver> | null, order) => {
      if (!step || typeof step.instruction !== 'string' || typeof step.index !== 'number' ||
          !Number.isInteger(step.index) || distances[step.index] === undefined) return [];
      return [{ instruction: step.instruction, type: step.type ?? 0, at: distances[step.index]!, order }];
    });
  }, [payload, segments, returnRoute]);
  const nextStep = progress && !offRoute ? steps.find(step => step.at >= Math.max(0, progress.traveled - 8)) : undefined;
  const turnDistance = nextStep && progress ? Math.max(0, Math.round((nextStep.at - progress.traveled) / 10) * 10) : undefined;
  const totalSeconds = returnRoute?.seconds ?? Number(payload['duration']) / 1000;
  const totalMeters = returnRoute ? returnRoute.km * 1000 : Number(payload['distance']);
  const arrival = progress && !offRoute && totalMeters > 0 && totalSeconds > 0 && Number.isFinite(totalSeconds)
    ? new Date(Date.now() + progress.remaining / totalMeters * totalSeconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined;
  const arrived = progress && !offRoute && progress.remaining < 20;
  const TurnIcon = nextStep && [9, 10, 11, 12, 18, 20, 23].includes(nextStep.type) ? CornerUpRight
    : nextStep && [13, 14, 15, 16, 19, 21, 24].includes(nextStep.type) ? CornerUpLeft
      : nextStep && [4, 5, 6].includes(nextStep.type) || arrived ? Flag : ArrowUp;

  useEffect(() => setVoiceAvailable('speechSynthesis' in window), []);
  useEffect(() => {
    if (!dashboard) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (voice) window.speechSynthesis?.cancel();
    };
  }, [dashboard, voice]);
  useEffect(() => {
    if (!dashboard || !voice || !nextStep || turnDistance === undefined || turnDistance > 200 || lastSpoken.current === nextStep.order) return;
    const speech = new SpeechSynthesisUtterance((turnDistance >= 30 ? 'Dans ' + turnDistance + ' mètres. ' : '') + nextStep.instruction);
    speech.lang = 'fr-FR';
    lastSpoken.current = nextStep.order;
    window.speechSynthesis.speak(speech);
  }, [dashboard, voice, nextStep, turnDistance]);
  const photoMarkers = photos.flatMap(photo => {
    const point = readSegments([[photo.payload['gps']]])[0]?.[0];
    return point ? [{ lat: point[0], lng: point[1], category: 'photo',
      label: String(photo.payload['description'] || 'Voir la photo'),
      url: '/medias?post=' + encodeURIComponent(photo.id) }] : [];
  });
  async function goBackToStart() {
    const destination = convoy?.target ?? originalSegments[0]?.[0];
    if (!position || !destination || returning) return;
    setReturning(true);
    try {
      const response = await fetch('/api/moto-route', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: position.point, end: destination, preference: 'road' }),
      });
      if (!response.ok) throw new Error();
      setReturnRoute(await response.json() as SuggestedRide);
      lastSpoken.current = undefined;
    } catch { toast.error(convoy ? 'Le trajet vers le regroupement est indisponible.' : 'Le retour au départ n’a pas pu être calculé.'); }
    finally { setReturning(false); }
  }

  useEffect(() => {
    if (!convoy?.join || !convoy.target || !position || position.accuracy > 35 || joinRequested.current) return;
    joinRequested.current = true;
    void goBackToStart();
  });

  const ranking = new Map<string, { name: string; best: number; vehicle: string; sessions: CrewRecord[] }>();
  if (publicCircuit) for (const result of [ride, ...records.filter(item => item.kind === 'circuit-lap' && item.payload['circuitId'] === ride.id)]) {
    const author = result.author_id;
    const best = Math.min(...readLapTimes(result.payload['laps']));
    if (!author || !Number.isFinite(best)) continue;
    const previous = ranking.get(author);
    const sessions = [...(previous?.sessions ?? []), result];
    ranking.set(author, previous && previous.best <= best ? { ...previous, sessions } : {
      name: String(result.payload['pilot'] || 'Pilote'), best, vehicle: String(result.payload['vehicleName'] || ''), sessions,
    });
  }
  const ranked = [...ranking.entries()].map(([id, entry]) => ({ id, ...entry })).sort((a, b) => a.best - b.best);
  const alreadyPublished = publishedCopy || records.some(record => record.author_id === user?.id && record.payload['publishedFromCircuit'] === ride.id);
  async function publishCircuit() {
    if (publishingCircuit || alreadyPublished || !user || user.id !== ride.author_id) return;
    setPublishingCircuit(true);
    try {
      await add('ride-track', { ...payload, visibility: 'public', circuit: true, publishedFromCircuit: ride.id });
      setPublishedCopy(true);
      toast.success('Boucle publiée dans Plan → Localiser.');
    } catch { toast.error('La boucle n’a pas pu être publiée.'); }
    finally { setPublishingCircuit(false); }
  }

  const maxSpeed = typeof payload['maxSpeed'] === 'number' ? payload['maxSpeed'] : undefined;

  return <>
    {dashboard && <section className="ride-dashboard" data-layout="balanced" aria-label="Compteur et guidage" onKeyDown={event => { if (event.key === 'Escape') { if (convoy) convoy.onClose(); else setDashboard(false); } }}>
      <div className="ride-dashboard-stats">
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="outline" size="icon" autoFocus aria-label="Fermer le compteur" onClick={() => { if (convoy) convoy.onClose(); else setDashboard(false); }}><X /></Button>
          {voiceAvailable && steps.length > 0 && <Button size="sm" variant={voice ? 'default' : 'outline'} aria-pressed={voice} onClick={() => { lastSpoken.current = undefined; setVoice(!voice); }}><Volume2 /> Voix</Button>}
        </div>
        <div className="ride-speed"><Gauge size={24} aria-hidden="true" /><span className="font-display font-bold tabular-nums">{speed === undefined ? '—' : Math.round(speed)}</span><span className="text-sm">km/h</span></div>
        <div className="grid justify-items-center gap-1 text-center">
          <TurnIcon size={34} aria-hidden="true" />
          <strong className={offRoute ? 'text-primary' : ''}>{error || (offRoute ? 'Hors de la trace · ' + Math.round(progress.distance) + ' m'
            : arrived ? 'Arrivée à proximité' : !position ? 'Recherche de ta position…'
              : !progress ? (segments.length ? 'Signal GPS faible' : 'Aucun itinéraire associé · rejoins le regroupement') : nextStep?.instruction || 'Suis la trace sur la carte')}</strong>
          {nextStep && !arrived && turnDistance !== undefined && <span>{turnDistance > 0 ? 'Dans ' + turnDistance + ' m' : 'Maintenant'}</span>}
          {arrival && <span className="text-sm">Arrivée vers {arrival}</span>}
          {progress && <span className="text-sm text-muted-foreground">{(progress.remaining / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km restants sur la trace</span>}
        </div>
        {convoy?.togglePause && <Button size="sm" variant="outline" aria-pressed={convoy.paused} onClick={convoy.togglePause}>{convoy.paused ? 'Je repars' : 'Je fais une pause'}</Button>}
        <Button size="sm" variant="outline" disabled={returning || !position || position.accuracy > 35 || Boolean(convoy && !convoy.target)} onClick={() => {
          if (returnRoute) { setReturnRoute(undefined); lastSpoken.current = undefined; } else void goBackToStart();
        }}>{returning ? 'Calcul en cours…' : returnRoute ? 'Reprendre le trajet initial' : convoy ? 'Rejoindre le regroupement' : 'Retour au départ'}</Button>
        <Button size="sm" variant="outline" onClick={() => { setFollowing(false); setDashboard(false); setSpeed(undefined); convoy?.onClose(); }}>Arrêter le guidage</Button>
      </div>
      <TrackMap segments={segments} stops={convoy?.target ? [...stops, { point: convoy.target, label: 'Regroupement' }] : stops} photoMarkers={photoMarkers} position={position} follow={following} pilots={convoy?.pilots ?? []} />
    </section>}
    {!convoy && <>
    <section className="ride-record grid gap-4">
      <header>
        <h2 className="font-display text-4xl font-bold">{String(payload['name'] ?? 'Parcours')}</h2>
        {ride.author_id && <Link to="/pilotes/$pilotId" params={{ pilotId: ride.author_id }} className="text-sm text-muted-foreground underline">{String(payload['pilot'] ?? 'Pilote')}</Link>}
      </header>
      {Boolean(payload['description']) && <p className="whitespace-pre-wrap break-words">{String(payload['description'])}</p>}
      <div className="flex flex-wrap items-center gap-2"><DifficultyBadge ride={ride} /><RideFavorite rideId={ride.id} /></div>
      <h3 className="text-lg font-semibold">{payload['planned'] === true ? 'Trajet prévu' : 'Bilan de sortie'}</h3>
      {isCircuit && !publicCircuit && <CircuitSession payload={payload} />}
      {isCircuit && !publicCircuit && user?.id === ride.author_id && user && <Button className="justify-self-start" disabled={publishingCircuit || alreadyPublished} onClick={() => void publishCircuit()}>{alreadyPublished ? 'Boucle publiée' : 'Publier la boucle'}</Button>}
      <RideStats distance={Number(payload['distance']) || 0} duration={Number(payload['duration']) || 0} motion={motionStats} maxSpeed={maxSpeed} />
    </section>
    {publicCircuit && <section className="ride-record grid gap-4">
      <h3 className="text-lg font-semibold">Classement de la boucle</h3>
      <div className="flex flex-wrap gap-2">
        {user && <Button aria-expanded={racing} onClick={() => setRacing(!racing)}><Flag />{racing ? 'Masquer le chrono' : 'Faire la boucle'}</Button>}
        <Button variant="outline" asChild><Link to="/map" search={{ circuit: ride.id }}><MapPin /> Aller à la boucle</Link></Button>
      </div>
      {ranked.length ? <ol className="grid gap-2">{ranked.map((pilot, index) => <li key={pilot.id}>
        <details><summary className="cursor-pointer">{index + 1}. {pilot.name}{pilot.vehicle ? ' · ' + pilot.vehicle : ''} · <strong>{formatLap(pilot.best)}</strong></summary>
          <div className="mt-2 grid gap-3">{pilot.sessions.map(session => <CircuitSession key={session.id} payload={session.payload} />)}</div>
        </details>
      </li>)}</ol> : <p className="text-sm text-muted-foreground">Aucun chrono publié.</p>}
      <div hidden={!racing}><CircuitRecorder blocked={following} circuit={ride} /></div>
    </section>}
    <section className="ride-record grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Refaire ce parcours</h3>
        <Button disabled={!segments.length} aria-pressed={following} onClick={() => {
          setError('');
          setPosition(undefined);
          setFollowing(!following);
        }}><LocateFixed /> {following ? 'Arrêter le suivi' : 'Suivre la trace'}</Button>
        <Button disabled={!segments.length} variant="outline" onClick={() => { setFollowing(true); setDashboard(true); setError(''); }}><Maximize /> Compteur et guidage</Button>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Téléchargements hors connexion">
        <Button size="sm" variant="outline" disabled={!segments.length} onClick={() => downloadRideGpx(title, segments, stops)}><Download /> Trace GPX</Button>
        <Button size="sm" variant="outline" disabled={downloadingMap || !segments.length} onClick={async () => {
          setDownloadingMap(true);
          try {
            const hasRoads = await downloadRideMap(title, segments, stops);
            if (!hasRoads) toast.info('Carte téléchargée avec la trace. Les routes de la zone étaient indisponibles.');
          } catch { toast.error('Impossible de télécharger la carte.'); }
          finally { setDownloadingMap(false); }
        }}><Download /> {downloadingMap ? 'Préparation…' : 'Carte hors connexion'}</Button>
      </div>
      {Array.isArray(payload['directions']) && <details><summary className="cursor-pointer">Directions de l’itinéraire</summary><ol className="mt-2 list-decimal space-y-1 pl-5">{payload['directions'].filter(step => typeof step === 'string').map((step, index) => <li key={index}>{step}</li>)}</ol></details>}
      {!dashboard && <TrackMap segments={segments} stops={stops} photoMarkers={photoMarkers} position={following ? position : undefined} follow={following} />}
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
        {payload['visibility'] !== 'private' && <Button asChild variant="outline"><Link to="/medias" search={{ ride: ride.id }}><ImagePlus /> Ajouter des photos</Link></Button>}
      </div>
      {photos.length ? <div className="media-grid">{photos.map(photo => <RidePhoto key={photo.id} photo={photo} />)}</div>
        : <p className="text-muted-foreground">Aucune photo associée à ce parcours.</p>}
    </section>
    </>}
  </>;
}

function CircuitSession({ payload }: { payload: CrewRecord['payload'] }) {
  const heat = payload['heat'] as { name?: unknown; mode?: unknown; seconds?: unknown; laps?: unknown; completed?: unknown } | undefined;
  const duration = typeof heat?.seconds === 'number' ? Math.round(heat.seconds / 60) + ' min' : '';
  const tours = typeof heat?.laps === 'number' ? heat.laps + ' tour(s)' : '';
  const format = heat?.mode === 'time-laps' ? duration + ' + ' + tours : heat?.mode === 'time' ? duration : heat?.mode === 'laps' ? tours : '';
  const details = [payload['vehicleName'], payload['surface']].filter(value => typeof value === 'string' && value.trim()).join(' · ');
  return <div className="grid gap-2">
    {format && <p className="text-sm font-semibold">{typeof heat?.name === 'string' && heat.name ? heat.name : 'Manche'} · {format} · {heat?.completed === true ? 'Terminée' : 'Interrompue'}</p>}
    {details && <p className="text-sm text-muted-foreground">{details}</p>}
    {typeof payload['sessionNotes'] === 'string' && payload['sessionNotes'] && <p className="whitespace-pre-wrap break-words text-sm">{payload['sessionNotes']}</p>}
    <LapResults value={payload['laps']} />
    <LapComparison value={payload['lapTraces']} times={payload['laps']} />
  </div>;
}

export function RidePhoto({ photo }: { photo: CrewRecord }) {
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
