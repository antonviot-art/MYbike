import { createFileRoute } from '@tanstack/react-router';
import { ChatPage } from '@/features/crew/chat';
import { pageHead } from '@/features/crew/head';

export const Route = createFileRoute('/discussion')({
  head: () => pageHead('Discussion', 'Échangez avec votre groupe et préparez la prochaine sortie.'),
  validateSearch: (search: Record<string, unknown>): { invite?: string } => {
    const code = typeof search['invite'] === 'string' ? search['invite'].trim().toUpperCase() : '';
    return /^[A-Z0-9]{6,16}$/.test(code) ? { invite: code } : {};
  },
  component: DiscussionRoute,
});

function DiscussionRoute() {
  const { invite } = Route.useSearch();
  return <ChatPage key={invite ?? ''} invite={invite} />;
}
