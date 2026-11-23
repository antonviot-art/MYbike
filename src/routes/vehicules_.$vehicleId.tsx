import { createFileRoute } from '@tanstack/react-router';
import { VehiclePage } from '@/features/crew/garage';
import { pageHead } from '@/features/crew/head';

export const Route = createFileRoute('/vehicules_/$vehicleId')({
  head: () => pageHead('Fiche véhicule', 'Photos, pièces et description de la machine.'),
  component: VehicleDetailRoute,
});

function VehicleDetailRoute() {
  const { vehicleId } = Route.useParams();
  return <VehiclePage vehicleId={vehicleId} />;
}
