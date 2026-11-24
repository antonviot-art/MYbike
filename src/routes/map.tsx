import { createFileRoute } from '@tanstack/react-router';
import { MapPage } from '@/features/crew/map-page';
import { pageHead } from '@/features/crew/head';
export const Route=createFileRoute('/map')({head:()=>pageHead('Plan','Préparez vos parcours moto et quad, importez vos traces GPX et partagez vos repères.'),validateSearch: (search: Record<string, unknown>): { loop?: boolean; circuit?: string } => ({ ...(search['loop'] === true ? { loop: true } : {}), ...(typeof search['circuit'] === 'string' ? { circuit: search['circuit'] } : {}) }), component: PlanRoute});

function PlanRoute() {
  const { loop, circuit } = Route.useSearch();
  return <MapPage key={circuit ?? String(loop)} loop={loop === true} circuitId={circuit} />;
}
