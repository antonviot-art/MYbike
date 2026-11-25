import { useEffect, useState } from 'react';
import { Bike, CalendarDays, Compass, Flag, Images, MapPin, MessageSquare, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { frenchRegions } from './regions';
import { useCrew } from './context';

const detailed = [
  { title: 'Prépare ton garage', icon: Bike, text: 'Dans Véhicules, ajoute ta moto ou ton quad. Quand tu enregistres une sortie ou un chrono, choisis le véhicule utilisé.' },
  { title: 'Repère-toi sur la carte', icon: MapPin, text: 'Dans Plan → Localiser, retrouve les repères, les rassos et les boucles publiées. Tu décides quand partager ta position.' },
  { title: 'Prépare un itinéraire', icon: Compass, text: 'Dans Plan → Itinéraire, choisis un départ, une arrivée et des points de passage. Enregistre le résultat pour le lancer plus tard dans le compteur.' },
  { title: 'Enregistre ta sortie', icon: Route, text: 'Dans Parcours → Enregistrer, démarre une trace GPS ou crée une boucle chronométrée. Tu peux garder une sortie sur ton appareil ou la publier.' },
  { title: 'Roule en groupe', icon: CalendarDays, text: 'Dans Rasso, confirme ta présence et utilise le compteur de convoi le jour du départ. Depuis Discussion, rejoins un groupe avec son code.' },
  { title: 'Partage tes souvenirs', icon: Images, text: 'Dans Médias, publie tes photos, vidéos ou stories. Après un rasso, retrouve aussi son album sur la fiche du rendez-vous.' },
] as const;

const quick = [
  { title: 'Trouve ta route', icon: Compass, text: 'Ouvre Plan pour te localiser ou calculer un trajet. Lance ensuite l’itinéraire depuis le compteur GPS.' },
  { title: 'Garde la trace', icon: Route, text: 'Va dans Parcours → Enregistrer pour suivre tes kilomètres ou chronométrer une boucle.' },
  { title: 'Retrouve tes potes', icon: MessageSquare, text: 'Rejoins leur discussion avec un code, puis retrouve les rendez-vous et les convois dans Rasso.' },
] as const;

export function WelcomeTutorial() {
  const { user, firstName } = useCrew();
  const id = user?.id;
  const key = 'mybike:tutorial:v1:' + id;
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<'quick' | 'detailed'>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    try { setDone(localStorage.getItem(key) === 'done'); }
    catch { /* The account can still store the tutorial state. */ }
    setReady(true);
  }, [key]);

  function finish() {
    setDone(true);
    try { localStorage.setItem(key, 'done'); } catch { /* Allow continuing. */ }
    void supabase.auth.updateUser({ data: { mybike_tutorial_v1: true } }).catch(() => {});
  }

  const open = Boolean(ready && user && !done && user.user_metadata['mybike_tutorial_v1'] !== true &&
    firstName && frenchRegions.includes(user.user_metadata['region']));
  const steps = mode === 'detailed' ? detailed : quick;
  const step = steps[index];
  return <Dialog open={open} onOpenChange={value => { if (!value) finish(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto" hideCloseButton>
      {mode && step ? <>
        <p className="text-sm text-muted-foreground" aria-live="polite">Étape {index + 1} sur {steps.length}</p>
        <step.icon className="text-primary" size={32} aria-hidden="true" />
        <DialogTitle className="font-display text-3xl">{step.title}</DialogTitle>
        <DialogDescription>{step.text}</DialogDescription>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" onClick={() => { if (index) setIndex(index - 1); else setMode(undefined); }}>Retour</Button>
          <Button onClick={() => { if (index + 1 === steps.length) finish(); else setIndex(index + 1); }}>
            {index + 1 === steps.length ? 'Entrer dans MYbike' : 'Suivant'}
          </Button>
        </div>
      </> : <>
        <Flag className="text-primary" size={32} aria-hidden="true" />
        <DialogTitle className="font-display text-3xl">Bienvenue {firstName} !</DialogTitle>
        <DialogDescription>Choisis ton tutoriel pour découvrir MYbike.</DialogDescription>
        <Button onClick={() => { setIndex(0); setMode('quick'); }}>Tutoriel rapide · 3 étapes</Button>
        <Button variant="outline" onClick={() => { setIndex(0); setMode('detailed'); }}>Tutoriel détaillé · 6 étapes</Button>
      </>}
      <Button variant="ghost" onClick={finish}>Passer le tutoriel</Button>
    </DialogContent>
  </Dialog>;
}
