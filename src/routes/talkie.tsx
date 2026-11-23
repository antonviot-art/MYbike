import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/talkie')({
  beforeLoad: () => { throw redirect({ to: '/discussion', replace: true }); },
});
