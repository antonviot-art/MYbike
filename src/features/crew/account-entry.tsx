import { useState, type FormEvent } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { frenchRegions } from './regions';

export function AccountEntry({ preferSignIn = false }: { preferSignIn?: boolean }) {
  const [register, setRegister] = useState(!preferSignIn);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
  }

  async function resetPassword() {
    const email = window.prompt('Votre adresse e-mail')?.trim();
    if (!email) return;
    setError('');
    setNotice('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: new URL('/reset-password', window.location.origin).href,
      });
      if (error) throw error;
      setNotice('Consulte ta boîte mail pour réinitialiser ton mot de passe.');
    } catch {
      setError('Impossible d’envoyer le lien pour le moment. Réessaie.');
    }
  }

  return <main className="account-entry">
    <section className="account-entry-panel">
      <div className="mb-3 flex items-center gap-3"><span className="brand-mark"><Flag size={23} aria-hidden="true" /></span>
        <span className="brand">MY<span className="text-primary">bike</span></span>
      </div>
      <p className="text-sm text-muted-foreground">Un compte est nécessaire pour accéder à MYbike.</p>
          <h1 className="font-display text-3xl">{register ? 'Créer ton compte MYbike' : 'Connexion à MYbike'}</h1>
          <p className="text-muted-foreground">{register ? 'Inscris-toi avec ton adresse e-mail.' : 'Connecte-toi avec ton e-mail et ton mot de passe.'}</p>
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
          {!register && <Button variant="ghost" onClick={() => void resetPassword()}>Mot de passe oublié ?</Button>}
    </section>
  </main>;
}
