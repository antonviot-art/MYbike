import { createFileRoute } from '@tanstack/react-router';
import { RideDetailPage } from '@/features/crew/ride-detail';
import { pageHead } from '@/features/crew/head';

export const Route = createFileRoute('/parcours_/$rideId')({
  head: () => pageHead('Rejouer un parcours', 'Bilan, photos et suivi de trace sur la carte.'),
  component: RidePage,
});

function RidePage() {
  const { rideId } = Route.useParams();
  return <RideDetailPage rideId={rideId} />;
}
