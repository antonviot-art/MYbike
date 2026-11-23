import { CrewShell, useProfilePhoto } from './shell';
import { useCrew } from './context';
import { Weather } from './weather';

export function HomePage() {
  const { firstName, user } = useCrew();
  const photo = useProfilePhoto(user?.id);
  return (
    <CrewShell tab="Accueil">
      <div className="mx-auto grid max-w-5xl gap-5">
        <section className={`home-hero ${photo ? 'has-profile-hero' : ''}`}>
          <img className="home-hero-scene" src="/mybike-enduro.jpg" alt="" fetchPriority="high" />
          {photo && <img className="home-hero-profile" src={photo} alt="" />}
          <h1 className="page-title">Bienvenue sur MYbike{firstName ? ', ' + firstName : ''} !</h1>
        </section>
        <Weather demo={!user} />
      </div>
    </CrewShell>
  );
}
