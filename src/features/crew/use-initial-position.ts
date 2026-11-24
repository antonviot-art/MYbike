import { useEffect, useState } from 'react';

export type InitialPosition = { lat: number; lng: number; accuracy: number };

export function useInitialPosition() {
  const [position, setPosition] = useState<InitialPosition>();
  useEffect(() => {
    let active = true;
    navigator.geolocation?.getCurrentPosition(({ coords }) => {
      if (active) setPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
    }, () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    return () => { active = false; };
  }, []);
  return position;
}
