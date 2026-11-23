import { createFileRoute, Link } from '@tanstack/react-router';
import { Avatar, CrewShell } from '@/features/crew/shell';
import { useCrew } from '@/features/crew/context';
import { TrackList } from '@/features/crew/rides';
import { pageHead } from '@/features/crew/head';
import { ProfileFriendAction } from '@/features/crew/profile-friend-action';

export const Route = createFileRoute('/pilotes/$pilotId')({
  head: () => pageHead('Profil pilote', 'Motos et parcours partagés par ce pilote.'),
  component: PilotPage,
});

function PilotPage() {
  const { pilotId } = Route.useParams();
  const { records, user, firstName } = useCrew();
  const owned = records.filter(record => record.author_id === pilotId);
  const vehicles = owned.filter(record => record.kind === 'vehicle');
  const routes = owned.filter(record => record.kind === 'ride-track').reverse();
  const message = owned.find(record => record.kind === 'message');
  const canAdd = user && user.id !== pilotId && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(pilotId);
  const name = (pilotId === user?.id && firstName) || vehicles[0]?.payload['owner'] ||
    routes[0]?.payload['pilot'] || message?.payload['name'] || 'Pilote MYbike';

  return <CrewShell tab="Profil">
    {!user ? <p className="text-muted-foreground">Connecte-toi pour voir ce pilote.</p> :
      <div className="mx-auto grid max-w-4xl gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar userId={pilotId} pilot={String(name).charAt(0).toUpperCase()} size="!h-16 !w-16 !text-2xl" />
            <h2 className="font-display text-4xl font-semibold">{String(name)}</h2>
          </div>
          {canAdd && <ProfileFriendAction key={user.id + pilotId} viewerId={user.id} pilotId={pilotId} />}
        </header>
        <section className="ride-record grid gap-3">
          <h3 className="text-xl font-semibold">Garage</h3>
          {vehicles.length ? <ul className="grid gap-2">{vehicles.map(record => <li key={record.id}>
            <Link to="/vehicules/$vehicleId" params={{ vehicleId: record.id }} className="underline">{String(record.payload['name'])}</Link>
          </li>)}</ul> : <p className="text-muted-foreground">Aucun véhicule partagé.</p>}
        </section>
        <section className="grid gap-3">
          <h3 className="text-xl font-semibold">Parcours partagés</h3>
          <TrackList records={routes} />
        </section>
      </div>}
  </CrewShell>;
}
