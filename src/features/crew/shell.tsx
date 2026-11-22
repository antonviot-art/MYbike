import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Bike, Flag, House, Images, LockKeyhole, LogOut, Map, MessageSquare, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useCrew } from './context';
import { frenchRegions } from './regions';

const tabs = [
  { to: '/', label: 'Accueil', icon: House },
  { to: '/discussion', label: 'Discussion', icon: MessageSquare },
  { to: '/vehicules', label: 'Véhicules', icon: Bike },
  { to: '/map', label: 'Carte', icon: Map },
  { to: '/medias', label: 'Médias', icon: Images },
] as const;

export function Avatar({ pilot, size = '' }: { pilot: string; size?: string }) {
  return <span className={`avatar-pilot ${size}`} data-pilot={pilot}>{pilot}</span>;
}

export function CrewShell({ tab, children }: { tab: string; children: ReactNode }) {
  const { user, firstName, loading } = useCrew();
  const [auth, setAuth] = useState(false);
  const [register, setRegister] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const region = user?.user_metadata['region'];
  const needsProfile = Boolean(user && (!firstName || !frenchRegions.includes(region)));

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    try {
      if (register) {
        const givenName = String(form.get('firstName') ?? '').trim();
        const selectedRegion = String(form.get('region') ?? '');
        if (!givenName || !frenchRegions.includes(selectedRegion)) {
          setError('Renseigne ton prénom et ta région.');
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: new URL('/', window.location.origin).href,
            data: {
              given_name: givenName,
              display_name: givenName,
              region: selectedRegion,
              locality: String(form.get('locality') ?? '').trim(),
            },
          },
        });
        if (error) {
          setError(error.code === 'signup_disabled' ? 'Les inscriptions sont désactivées pour le moment.' : error.message);
          return;
        }
        if (!data.session) {
          setRegister(false);
          setNotice('Si un lien de confirmation a été envoyé, ouvre-le, puis connecte-toi. Pense à vérifier tes indésirables.');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(error.code === 'email_not_confirmed' ? 'Confirme ton adresse avec le lien reçu par e-mail.' : 'Connexion impossible. Vérifie ton adresse e-mail et ton mot de passe.');
          return;
        }
      }
      setAuth(false);
    } catch {
      setError('Le service est momentanément indisponible. Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  function selectAuthMode(signUp: boolean) {
    setRegister(signUp);
    setError('');
    setNotice('');
    setAuth(true);
  }

  async function saveFirstName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = String(form.get('firstName') ?? '').trim();
    const selectedRegion = String(form.get('region') ?? '');
    const locality = String(form.get('locality') ?? '').trim();
    if (!value || !frenchRegions.includes(selectedRegion)) {
      toast.error('Renseigne ton prénom et ta région.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { given_name: value, region: selectedRegion, locality } });
      if (error) throw error;
    } catch {
      toast.error('Le profil n’a pas pu être enregistré. Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const email = window.prompt('Votre adresse e-mail');
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success('Lien de réinitialisation demandé. Consultez votre boîte mail.');
  }

  function signOut() {
    void supabase.auth.signOut().then(({ error }) => {
      if (error) toast.error('La déconnexion a échoué. Réessayez.');
    });
  }

  return (
    <>
      <header className="app-header">
        <div className="app-width flex h-full items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-3">
            <span className="brand-mark"><Flag size={23} aria-hidden="true" /></span>
            <span className="brand">MY<span className="text-primary">bike</span></span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
            {!user && <span className="hidden text-xs text-muted-foreground md:inline">Version démo</span>}
            {user ? (
              <Button variant="ghost" className="gap-2" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter">
                {firstName && <Avatar pilot={firstName.charAt(0).toUpperCase()} />}
                <LogOut />
              </Button>
            ) : (
              <>
                <Button className="px-2 sm:px-4" variant="ghost" onClick={() => selectAuthMode(false)}><UserRound className="hidden sm:block" /> Connexion</Button>
                <Button className="px-2 sm:px-4" onClick={() => selectAuthMode(true)}>Créer un compte</Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="app-width app-main pt-8 sm:pt-10">
        {tab !== 'Accueil' && <h1 className="page-title mb-6">{tab}</h1>}
        {loading && <p role="status" className="mb-3 text-sm text-muted-foreground">Synchronisation…</p>}
        <div className="page-enter">{children}</div>
        {!user && (
          <footer className="app-footer flex items-center gap-2">
            <LockKeyhole size={13} /> Données fictives · modifications temporaires
          </footer>
        )}
      </main>
      <nav className="app-nav" aria-label="Navigation principale">
        <div className="app-nav-links">
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} activeOptions={{ exact: true }} className="nav-item">
              <Icon size={20} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
      <Dialog open={auth && !user} onOpenChange={setAuth}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle className="font-display text-3xl">{register ? 'Créer ton compte MYbike' : 'Connexion à MYbike'}</DialogTitle>
          <DialogDescription>{register ? 'Inscris-toi avec ton adresse e-mail.' : 'Connecte-toi avec ton e-mail et ton mot de passe.'}</DialogDescription>
          <form key={String(register)} onSubmit={submitAuth} className="grid gap-4">
            {register && <>
              <label className="grid gap-2 text-sm">Prénom<input name="firstName" required maxLength={80} autoComplete="given-name" /></label>
              <label className="grid gap-2 text-sm">Région
                <select name="region" required defaultValue="">
                  <option value="">Choisis ta région</option>
                  {frenchRegions.map(item => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm">Ville ou département (facultatif)<input name="locality" maxLength={100} /></label>
            </>}
            <label className="grid gap-2 text-sm">Adresse e-mail<input name="email" type="email" required autoComplete="email" /></label>
            <label className="grid gap-2 text-sm">Mot de passe<input name="password" type="password" required minLength={register ? 8 : undefined} autoComplete={register ? 'new-password' : 'current-password'} /></label>
            {error && <p role="alert" className="text-primary text-sm">{error}</p>}
            {notice && <p role="status" className="text-sm">{notice}</p>}
            <Button disabled={busy}>{busy ? 'Un instant…' : register ? 'Créer mon compte' : 'Se connecter'}</Button>
          </form>
          <Button variant="ghost" disabled={busy} onClick={() => selectAuthMode(!register)}>
            {register ? 'J’ai déjà un compte' : 'Créer un compte'}
          </Button>
          {!register && <Button variant="ghost" onClick={resetPassword}>Mot de passe oublié ?</Button>}
        </DialogContent>
      </Dialog>
      <Dialog open={needsProfile}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto" hideCloseButton onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
          <DialogTitle className="font-display text-3xl">Ton profil MYbike</DialogTitle>
          <DialogDescription>Ta région détermine la discussion locale qui t’est proposée.</DialogDescription>
          <form onSubmit={saveFirstName} className="grid gap-4">
            <label className="grid gap-2 text-sm">Prénom<input name="firstName" defaultValue={firstName} required maxLength={80} autoComplete="given-name" /></label>
            <label className="grid gap-2 text-sm">
              Région
              <select name="region" required defaultValue={typeof region === 'string' ? region : ''}>
                <option value="">Choisis ta région</option>
                {frenchRegions.map(item => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              Ville ou département (facultatif)
              <input name="locality" maxLength={100} placeholder="Ex. Aube ou Haute-Marne" />
            </label>
            <Button disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer mon profil'}</Button>
          </form>
          <Button variant="ghost" onClick={signOut} disabled={busy}>Se déconnecter</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
