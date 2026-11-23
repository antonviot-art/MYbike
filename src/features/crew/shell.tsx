import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Flag, House, Images, LockKeyhole, Map, MessageSquare, Radio, Route as RouteIcon, Settings, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { resolveMedia, useCrew } from './context';
import { frenchRegions } from './regions';
import { Friends } from './friends';

const tabs = [
  { to: '/', label: 'Accueil', icon: House },
  { to: '/discussion', label: 'Discussion', icon: MessageSquare },
  { to: '/talkie', label: 'Talkie', icon: Radio },
  { to: '/vehicules', label: 'Véhicules', icon: Bike },
  { to: '/map', label: 'Localiser', icon: Map },
  { to: '/parcours', label: 'Parcours', icon: RouteIcon },
  { to: '/medias', label: 'Médias', icon: Images },
] as const;

export function Avatar({ pilot, size = '', userId }: { pilot: string; size?: string; userId?: string | null | undefined }) {
  const { data: photo } = useQuery({
    queryKey: ['profile-photo', userId],
    enabled: Boolean(userId),
    staleTime: 240000,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
      if (error) throw error;
      if (!data?.avatar_url || !data.avatar_url.startsWith(userId + '/avatars/')) return null;
      return resolveMedia(data.avatar_url);
    },
  });
  return <span className={`avatar-pilot overflow-hidden ${size}`} data-pilot={pilot}>
    {photo ? <img className="h-full w-full object-cover" src={photo} alt="" onError={event => { event.currentTarget.hidden = true; }} /> : pilot}
  </span>;
}

export function CrewShell({ tab, children }: { tab: string; children: ReactNode }) {
  const { user, firstName, loading, upload } = useCrew();
  const queryClient = useQueryClient();
  const [auth, setAuth] = useState(false);
  const [register, setRegister] = useState(false);
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false);
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
    const photo = form.get('avatar');
    if (!value || !frenchRegions.includes(selectedRegion)) {
      toast.error('Renseigne ton prénom et ta région.');
      return;
    }
    setBusy(true);
    try {
      if (photo instanceof File && photo.size && user) {
        const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        const extension = extensions[photo.type];
        if (!extension || photo.size > 5 * 1024 * 1024) {
          toast.error('Choisis une photo JPEG, PNG ou WebP de moins de 5 Mo.');
          return;
        }
        const avatar = await upload(photo, extension, 'avatars');
        const { error } = await supabase.from('profiles').update({ avatar_url: avatar }).eq('id', user.id).select('id').single();
        if (error) throw error;
        void queryClient.invalidateQueries({ queryKey: ['profile-photo', user.id] });
      }
      const { error } = await supabase.auth.updateUser({ data: { given_name: value, region: selectedRegion, locality } });
      if (error) throw error;
      if (settings) {
        setSettings(false);
        toast.success('Profil enregistré.');
      }
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
      else setSettings(false);
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
              <>
                <Friends key={user.id} />
                <Button variant="ghost" className="gap-1 px-1 sm:px-2" onClick={() => setSettings(true)} aria-label="Réglages du compte" title="Réglages du compte">
                  {firstName && <Avatar pilot={firstName.charAt(0).toUpperCase()} userId={user.id} />}
                  <Settings />
                </Button>
              </>
            ) : (
              <>
                <Button className="px-2 sm:px-4" variant="ghost" onClick={() => selectAuthMode(false)}><UserRound className="hidden sm:block" /> Connexion</Button>
                <Button className="px-2 sm:px-4" onClick={() => selectAuthMode(true)}>Créer un compte</Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className={tab === 'Localiser' ? 'app-map-main' : 'app-width app-main pt-8 sm:pt-10'}>
        {tab !== 'Accueil' && tab !== 'Localiser' && <h1 className="page-title mb-6">{tab}</h1>}
        {loading && tab !== 'Localiser' && <p role="status" className="mb-3 text-sm text-muted-foreground">Synchronisation…</p>}
        <div className="page-enter">{children}</div>
        {!user && tab !== 'Localiser' && (
          <footer className="app-footer flex items-center gap-2">
            <LockKeyhole size={13} /> Données fictives · modifications temporaires
          </footer>
        )}
      </main>
      <nav className="app-nav" aria-label="Navigation principale">
        <div className="app-nav-links">
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} activeOptions={{ exact: to !== '/vehicules' }} className="nav-item">
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
      <Dialog open={Boolean(user && (needsProfile || settings))} onOpenChange={setSettings}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto" hideCloseButton={needsProfile} onEscapeKeyDown={event => { if (needsProfile) event.preventDefault(); }} onInteractOutside={event => { if (needsProfile) event.preventDefault(); }}>
          <DialogTitle className="font-display text-3xl">{settings ? 'Réglages du compte' : 'Ton profil MYbike'}</DialogTitle>
          <DialogDescription>{settings ? user?.email : 'Ta région détermine la discussion locale qui t’est proposée.'}</DialogDescription>
          <form onSubmit={saveFirstName} className="grid gap-4">
            <label className="grid gap-2 text-sm">Photo de profil (facultative)
              <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" />
            </label>
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
              <input name="locality" maxLength={100} placeholder="Ex. Aube ou Haute-Marne" defaultValue={String(user?.user_metadata['locality'] ?? '')} />
            </label>
            <Button disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer mon profil'}</Button>
          </form>
          {settings && user && !needsProfile &&
            <Button asChild variant="outline" onClick={() => setSettings(false)}><Link to="/pilotes/$pilotId" params={{ pilotId: user.id }}>Voir mon profil</Link></Button>}
          <Button variant="ghost" onClick={signOut} disabled={busy}>Se déconnecter</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
