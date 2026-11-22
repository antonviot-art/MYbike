import { createFileRoute } from '@tanstack/react-router';
import { ChatPage } from '@/features/crew/chat';
import { pageHead } from '@/features/crew/head';

export const Route = createFileRoute('/talkie')({
  head: () => pageHead('Talkie', 'Envoie et écoute les messages vocaux de ton groupe.'),
  component: TalkiePage,
});

function TalkiePage() {
  return <ChatPage talkie />;
}
