import { CrewShell } from './shell';
import { useCrew } from './context';
import { Weather } from './weather';

export function HomePage() {
  const { firstName, user } = useCrew();
  return (
    <CrewShell tab="Accueil">
      <div className="mx-auto grid max-w-5xl gap-5">
        <section className="home-hero">
          <img src="/mybike-enduro.jpg" alt="" fetchPriority="high" />
          <h1 className="page-title">Bienvenue sur MYbike{firstName ? ', ' + firstName : ''} !</h1>
        </section>
        <Weather demo={!user} />
      </div>
    </CrewShell>
  );
}
