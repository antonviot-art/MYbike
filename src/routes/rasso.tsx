import { createFileRoute } from '@tanstack/react-router';
import { RassoPage } from '@/features/crew/rasso';
import { pageHead } from '@/features/crew/head';

export const Route = createFileRoute('/rasso')({
  validateSearch: (search: Record<string, unknown>): { id?: string } =>
    typeof search['id'] === 'string' ? { id: search['id'] } : {},
  head: () => pageHead('Rasso', 'Organise un rendez-vous entre pilotes et réponds aux prochaines sorties.'),
  component: RassoRoute,
});

function RassoRoute() {
  return <RassoPage selected={Route.useSearch().id} />;
}
