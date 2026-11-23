import { createFileRoute } from '@tanstack/react-router';
import { MediaPage } from '@/features/crew/media';
import { pageHead } from '@/features/crew/head';
export const Route = createFileRoute('/medias')({
  validateSearch: (search: Record<string, unknown>): { ride?: string } =>
    typeof search['ride'] === 'string' ? { ride: search['ride'] } : {},
  head: () => pageHead('Les souvenirs', 'Les photos et vidéos des sorties moto et quad du groupe.'),
  component: MediasRoute,
});

function MediasRoute() {
  return <MediaPage initialRide={Route.useSearch().ride} />;
}
