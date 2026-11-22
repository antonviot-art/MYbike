import { useEffect, useState } from 'react';
import { CloudRain, CloudSun, Droplets, LocateFixed, MapPin, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';

type WeatherReading = {
  current: { temperature_2m: number; wind_speed_10m: number; precipitation: number; weather_code: number };
  daily: { precipitation_probability_max: number[] };
};
type Place = { lat: number; lng: number; label: string };

const demoPlace = { lat: 48.065, lng: 6.863, label: 'Gérardmer · météo de démo' };

function rideOutlook({ current, daily }: WeatherReading) {
  const code = current.weather_code;
  if (code >= 95) return 'Orage en cours. Mieux vaut reporter la sortie.';
  if (code === 56 || code === 57 || code === 66 || code === 67 || (code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'Neige ou risque de verglas. Vérifie les conditions avant de partir.';
  if (current.precipitation > 0 || code >= 51) return 'Ça tombe dehors. Garde la sortie pour une accalmie.';
  if (code === 45 || code === 48) return 'Brouillard dans le secteur. Attends que la visibilité s’améliore.';
  if (current.wind_speed_10m >= 35) return 'Le vent souffle fort. Garde un œil sur les conditions avant de partir.';
  if ((daily.precipitation_probability_max[0] ?? 0) >= 60) return 'Il fait sec pour le moment, mais la pluie pourrait arriver dans la journée.';
  if (code === 3) return 'Ciel couvert, mais sec pour le moment. Une petite boucle te tente ?';
  return 'Un temps sec pour profiter des chemins. C’est peut-être le moment de sortir la moto.';
}

export function Weather({ demo }: { demo: boolean }) {
  const [localPlace, setLocalPlace] = useState<Place>();
  const [result, setResult] = useState<{ place: Place; reading: WeatherReading }>();
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const place = localPlace ?? (demo ? demoPlace : undefined);
  const reading = result?.place === place ? result?.reading : undefined;

  useEffect(() => {
    if (!place) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      latitude: String(place.lat), longitude: String(place.lng),
      current: 'temperature_2m,wind_speed_10m,precipitation,weather_code',
      daily: 'precipitation_probability_max',
      forecast_days: '1', timezone: 'auto',
    });
    fetch('https://api.open-meteo.com/v1/forecast?' + query, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Météo indisponible');
        return response.json() as Promise<WeatherReading>;
      })
      .then(data => { if (!controller.signal.aborted) setResult({ place, reading: data }); })
      .catch(() => { if (!controller.signal.aborted) setError('Météo momentanément indisponible.'); });
    return () => controller.abort();
  }, [place]);

  function locate() {
    setError('');
    if (!navigator.geolocation) {
      setError('Ton navigateur ne propose pas la localisation.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocalPlace({ lat: Number(coords.latitude.toFixed(2)), lng: Number(coords.longitude.toFixed(2)), label: 'Autour de toi' });
      setLocating(false);
    }, () => {
      setError('Position indisponible. Vérifie les autorisations de localisation du navigateur.');
      setLocating(false);
    }, { timeout: 10000, maximumAge: 60000 });
  }

  return (
    <div className="grid gap-3">
      {reading && <p className="ride-outlook"><CloudSun size={22} aria-hidden="true" /> {rideOutlook(reading)}</p>}
      <section className="weather-card" aria-labelledby="weather-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="weather-title" className="text-xl font-semibold">Météo du jour</h2>
            {place && <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin size={14} aria-hidden="true" /> {place.label}</p>}
          </div>
          <Button variant="outline" disabled={locating} onClick={locate}><LocateFixed /> {locating ? 'Localisation…' : 'Ma météo locale'}</Button>
        </div>
        {reading ? (
          <>
            <p className="my-4 flex items-center gap-3 font-display text-5xl font-bold">
              {reading.current.precipitation > 0 ? <CloudRain className="text-primary" /> : <CloudSun className="text-primary" />}
              {Math.round(reading.current.temperature_2m)} °C
            </p>
            <dl className="weather-details">
              <div><dt><Wind size={15} aria-hidden="true" /> Vent</dt><dd>{Math.round(reading.current.wind_speed_10m)} km/h</dd></div>
              <div><dt><Droplets size={15} aria-hidden="true" /> Précipitations actuelles</dt><dd>{reading.current.precipitation} mm</dd></div>
              <div><dt>Risque de précipitations</dt><dd>{reading.daily.precipitation_probability_max[0] ?? '–'} %</dd></div>
            </dl>
            <a className="mt-4 inline-block text-xs underline text-muted-foreground" href="https://open-meteo.com/">Données Open-Meteo</a>
          </>
        ) : !error && <p role="status" className="mt-4 text-muted-foreground">{place ? 'Chargement de la météo…' : 'Utilise ta position pour afficher les conditions près de chez toi.'}</p>}
        {error && <p role="status" className="mt-4 text-sm text-muted-foreground">{error}</p>}
      </section>
    </div>
  );
}
