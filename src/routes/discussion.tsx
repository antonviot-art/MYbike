import { createFileRoute } from '@tanstack/react-router';
import { ChatPage } from '@/features/crew/chat';
import { pageHead } from '@/features/crew/head';

export const Route = createFileRoute('/discussion')({
  head: () => pageHead('Discussion', 'Échangez avec votre groupe et préparez la prochaine sortie.'),
  component: ChatPage,
});
