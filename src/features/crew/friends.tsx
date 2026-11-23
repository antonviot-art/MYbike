import { useEffect, useState, type FormEvent } from 'react';
import { Copy, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCrew } from './context';
import { socialCall, type Friend } from './social';

export function Friends() {
  const { user, refresh } = useCrew();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shortCode, setShortCode] = useState('');
  const userId = user?.id;

  async function load() {
    setFriends(await socialCall('mybike_friends_list', {}));
    setError('');
  }

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    void socialCall('mybike_friend_code', {}).then(code => { if (active) setShortCode(code); }).catch(() => {});
    const check = () => void socialCall('mybike_friends_list', {}).then(items => {
      if (active) { setFriends(items); setError(''); }
    }).catch(error => { if (active) setError(error.message); });
    check();
    const timer = window.setInterval(check, 20000);
    return () => { active = false; window.clearInterval(timer); };
  }, [open, userId]);

  async function change(friendId: string, accept: boolean) {
    setBusy(true);
    setError('');
    try {
      await socialCall(accept ? 'mybike_friend_accept' : 'mybike_friend_request', { friend_id: friendId });
      await load();
      if (accept) await refresh();
      toast.success(accept ? 'Demande acceptée.' : 'Demande envoyée.');
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Action impossible.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get('code') ?? '').trim().toUpperCase();
    if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(code)) {
      if (await change(code, false)) form.reset();
      return;
    }
    if (!/^[A-Z2-9]{5}$/.test(code)) {
      setError('Le nouveau code ami comporte cinq caractères.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await socialCall('mybike_friend_request_code', { friend_code: code });
      if (result !== 'ok') throw new Error(result === 'rate' ? 'Trop d’essais. Réessaie dans une minute.' : 'Code ami inconnu.');
      await load();
      form.reset();
      toast.success('Demande envoyée.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  if (!userId) return null;
  const displayCode = shortCode || userId;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" aria-label="Ajouter des amis" title="Ajouter des amis" className="px-2 sm:px-4"><UserPlus /><span className="hidden sm:inline">Amis</span></Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle>Mes amis</DialogTitle>
        <DialogDescription>Partage ton code ami ou saisis celui d’un autre membre.</DialogDescription>
        <label className="grid gap-1 text-sm">Mon code ami
          <input readOnly value={displayCode} onFocus={event => event.currentTarget.select()} />
        </label>
        <Button variant="outline" onClick={() => void navigator.clipboard.writeText(displayCode).then(() => toast.success('Code ami copié.')).catch(() => toast.error('Sélectionne le code pour le copier manuellement.'))}><Copy /> Copier</Button>
        <form onSubmit={request} className="grid gap-2">
          <label className="grid gap-1 text-sm">Code de ton ami<input name="code" required maxLength={40} autoComplete="off" /></label>
          <Button disabled={busy}>Envoyer une demande</Button>
        </form>
        {error && <p role="alert" className="text-sm text-primary">{error}</p>}
        {friends.length > 0 && <ul className="grid gap-2">
          {friends.map(friend => <li key={friend.user_id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary p-3">
            <span>{friend.display_name}</span>
            {friend.status === 'incoming' ? <Button size="sm" disabled={busy} onClick={() => void change(friend.user_id, true)}>Accepter</Button>
              : <span className="text-sm text-muted-foreground">{friend.status === 'accepted' ? 'Ami' : 'En attente'}</span>}
          </li>)}
        </ul>}
      </DialogContent>
    </Dialog>
  );
}
