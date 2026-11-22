import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Bike, Images, Map, MessageSquare } from 'lucide-react';
import { CrewShell } from './shell';
import { useCrew } from './context';
import { images } from './data';
import { Weather } from './weather';
import { Friends } from './friends';

const shortcuts = [
  { to: '/discussion', title: 'Discussions', description: 'Retrouve tes conversations et tes sondages.', icon: MessageSquare },
  { to: '/vehicules', title: 'Garage', description: 'Suis tes compteurs et l’entretien des machines.', icon: Bike },
  { to: '/map', title: 'Carte', description: 'Retrouve les repères et les positions partagées.', icon: Map },
  { to: '/medias', title: 'Médias', description: 'Revois les photos et vidéos du groupe.', icon: Images },
] as const;

export function HomePage() {
  const { firstName, user } = useCrew();
  return (
    <CrewShell tab="Accueil">
      <div className="mx-auto grid max-w-5xl gap-5">
        <section className="home-hero">
          <img src={images['ride']} alt="" />
          <h1 className="page-title">Bienvenue sur MYbike{firstName ? ', ' + firstName : ''} !</h1>
        </section>
        <Weather demo={!user} />
        {user && <div><Friends key={user.id} /></div>}
        <section aria-label="Accès rapides" className="home-shortcuts">
          {shortcuts.map(({ to, title, description, icon: Icon }) => (
            <Link key={to} to={to} className="home-shortcut">
              <Icon size={21} aria-hidden="true" />
              <span><strong>{title}</strong><small>{description}</small></span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </section>
      </div>
    </CrewShell>
  );
}
