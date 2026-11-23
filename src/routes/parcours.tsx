import { createFileRoute } from '@tanstack/react-router';
import { RidesPage } from '@/features/crew/rides';
import { pageHead } from '@/features/crew/head';
export const Route = createFileRoute('/parcours')({
  head: () => pageHead('Parcours', 'Enregistre et partage tes parcours moto.'),
  component: RidesPage,
});
