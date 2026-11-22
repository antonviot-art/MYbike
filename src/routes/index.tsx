import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '@/features/crew/home';
import { pageHead } from '@/features/crew/head';

export const Route = createFileRoute('/')({
  head: () => pageHead('Accueil', 'Retrouvez votre groupe de sorties moto et quad.'),
  component: HomePage,
});
