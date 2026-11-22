import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCrew } from './context';
import { validCounter, type Vehicle } from './data';

export function AddVehicle() {
  const { add, name } = useCrew();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('name') ?? '').trim();
    const type = String(form.get('type'));
    const cc = Number(form.get('cc'));
    const hours = Number(form.get('hours'));
    const km = Number(form.get('km'));
    if (!title || !Number.isInteger(cc) || cc <= 0 || !validCounter(hours) || !validCounter(km)) {
      toast.error('Vérifie le modèle, la cylindrée et les compteurs.');
      return;
    }
    const vehicle: Vehicle = {
      name: title, owner: name, pilot: name.charAt(0).toUpperCase(),
      type, cc, hours, km, image: '', maintenance: [], alert: 'Aucune intervention planifiée',
    };
    setSaving(true);
    try {
      await add('vehicle', vehicle);
      setOpen(false);
      toast.success('Véhicule ajouté au garage.');
    } catch {
      toast.error('Le véhicule n’a pas pu être ajouté.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Ajouter un véhicule</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle>Ajouter un véhicule</DialogTitle>
        <DialogDescription>Renseigne le modèle et les compteurs de ta machine.</DialogDescription>
        <form onSubmit={submit} className="grid gap-3">
          <label className="grid gap-1">Marque et modèle<input name="name" placeholder="Ex. Beta RR 300" maxLength={80} required /></label>
          <label className="grid gap-1">Type<select name="type"><option>Enduro</option><option>Moto de route</option><option>Motocross</option><option>Quad</option><option>Autre</option></select></label>
          <label className="grid gap-1">Cylindrée (cm³)<input name="cc" type="number" min={1} required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">Heures moteur<input name="hours" type="number" min={0} step="0.1" defaultValue={0} required /></label>
            <label className="grid gap-1">Kilométrage<input name="km" type="number" min={0} defaultValue={0} required /></label>
          </div>
          <Button disabled={saving}>{saving ? 'Enregistrement…' : 'Ajouter au garage'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
