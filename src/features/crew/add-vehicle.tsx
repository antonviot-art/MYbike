import { useRef, useState, type FormEvent } from 'react';
import { Mic, Plus, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCrew } from './context';
import { validCounter, type Vehicle } from './data';
import { useFrenchDictation } from './use-french-dictation';
import { parseVehicleNotes } from './vehicle-draft';

export function AddVehicle() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Ajouter un véhicule</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle>Ajouter un véhicule</DialogTitle>
        <DialogDescription>Indique son modèle ou préremplis la fiche avec tes notes.</DialogDescription>
        {open && <VehicleSetup onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function VehicleSetup({ onSaved }: { onSaved: () => void }) {
  const { add, name } = useCrew();
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [fields, setFields] = useState({ name: '', type: 'Moto', cc: '', hours: '', km: '', description: '', parts: '' });
  const details = useRef<HTMLDetailsElement>(null);
  const { mic, error, dictate } = useFrenchDictation(text =>
    setNotes(previous => (previous ? previous + ' ' + text : text).slice(0, 950)),
  );

  function fill() {
    if (!notes.trim()) return;
    const draft = parseVehicleNotes(notes);
    if (!Object.keys(draft).length) {
      setStatus('Ajoute le nom de ta moto ou des indications comme « 350 cm³ » ou « 60 h ».');
      return;
    }
    setFields(previous => ({
      name: draft.name ?? previous.name, type: draft.type ?? previous.type,
      cc: draft.cc === undefined ? previous.cc : String(draft.cc),
      hours: draft.hours === undefined ? previous.hours : String(draft.hours),
      km: draft.km === undefined ? previous.km : String(draft.km),
      description: draft.description ?? previous.description, parts: draft.parts ?? previous.parts,
    }));
    if (details.current && Object.keys(draft).some(field => field !== 'name')) details.current.open = true;
    setStatus('Fiche préremplie. Vérifie les champs avant d’enregistrer.');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const title = fields.name.trim();
    const cc = Number(fields.cc);
    const hours = Number(fields.hours);
    const km = Number(fields.km);
    if (!title || !Number.isInteger(cc) || cc < 0 || !validCounter(hours) || !validCounter(km)) {
      toast.error('Vérifie le modèle et les valeurs renseignées.');
      return;
    }
    const vehicle: Vehicle = {
      name: title, owner: name, pilot: name.charAt(0).toUpperCase(),
      type: fields.type, cc, hours, km, image: '', maintenance: [], alert: 'Aucune intervention planifiée',
    };
    setSaving(true);
    try {
      await add('vehicle', { ...vehicle, description: fields.description.trim(), parts: fields.parts.trim() });
      onSaved();
      toast.success('Véhicule ajouté au garage.');
    } catch {
      toast.error('Le véhicule n’a pas pu être ajouté.');
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <section className="grid gap-3 rounded-2xl border border-border bg-secondary p-3">
        <label className="grid gap-1 font-semibold">Configuration rapide
          <textarea rows={3} className="text-sm font-normal" maxLength={950} value={notes} onChange={event => setNotes(event.target.value)}
            placeholder="Ex. KTM 350 EXC-F, enduro, 350 cm³, 60 h, 1 200 km, avec pneus Michelin" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={dictate}><Mic /> {mic ? 'Arrêter la dictée' : 'Dicter'}</Button>
          <Button type="button" variant="secondary" size="sm" disabled={!notes.trim() || mic || saving} onClick={fill}><WandSparkles /> Préremplir la fiche</Button>
        </div>
        {(error || status) && <p role="status" className="text-sm text-muted-foreground">{error || status}</p>}
      </section>
      <label className="grid gap-1">Marque et modèle<input name="name" placeholder="Ex. Beta RR 300" maxLength={80} required
        value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} /></label>
      <details ref={details} className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer font-semibold">Détails facultatifs</summary>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1">Type<select name="type" value={fields.type} onChange={event => setFields({ ...fields, type: event.target.value })}>
            <option>Moto</option><option>Enduro</option><option>Moto de route</option><option>Motocross</option><option>Quad</option><option>Autre</option>
          </select></label>
          <label className="grid gap-1">Cylindrée (cm³)<input name="cc" type="number" min={1} value={fields.cc} onChange={event => setFields({ ...fields, cc: event.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">Heures moteur<input name="hours" type="number" min={0} step="0.1" value={fields.hours} onChange={event => setFields({ ...fields, hours: event.target.value })} /></label>
            <label className="grid gap-1">Kilométrage<input name="km" type="number" min={0} value={fields.km} onChange={event => setFields({ ...fields, km: event.target.value })} /></label>
          </div>
          <label className="grid gap-1">Description<textarea name="description" maxLength={1200} value={fields.description} onChange={event => setFields({ ...fields, description: event.target.value })} /></label>
          <label className="grid gap-1">Pièces et équipement<textarea name="parts" maxLength={1200} value={fields.parts} onChange={event => setFields({ ...fields, parts: event.target.value })} /></label>
        </div>
      </details>
      <Button disabled={saving || mic}>{saving ? 'Enregistrement…' : 'Ajouter au garage'}</Button>
    </form>
  );
}
