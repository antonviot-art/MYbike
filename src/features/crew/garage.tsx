import { useEffect, useState, type FormEvent } from 'react';
import { Bike, ChevronRight, Gauge, Timer, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AddVehicle } from './add-vehicle';
import { CrewShell } from './shell';
import { resolveMedia, useCrew } from './context';
import { images, validCounter, type CrewRecord, type Vehicle } from './data';

function VehiclePhoto({ path, label }: { path: string; label: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    setUrl('');
    if (path.startsWith('/')) setUrl(path);
    else if (path) void resolveMedia(path).then(value => { if (active) setUrl(value); }).catch(() => {});
    return () => { active = false; };
  }, [path]);
  return url
    ? <img src={url} alt={label} className="vehicle-photo" onError={() => setUrl('')} />
    : <div className="vehicle-photo grid place-items-center bg-card"><Bike size={36} aria-hidden="true" /></div>;
}

type Details = Vehicle & { description?: string; parts?: string; photos?: string[] };

export function GaragePage() {
  const { records, user } = useCrew();
  const [selected, setSelected] = useState<string>();
  const vehicles = records.filter(record => record.kind === 'vehicle');
  const current = vehicles.find(record => record.id === selected);

  return (
    <CrewShell tab="Véhicules">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">{vehicles.length} {vehicles.length === 1 ? 'véhicule' : 'véhicules'} dans le garage</p>
        <AddVehicle />
      </div>
      {!vehicles.length && <p className="text-muted-foreground">Ajoute ta première machine pour suivre ses compteurs et son entretien.</p>}
      <div className="vehicle-grid">
        {vehicles.map(record => {
          const vehicle = record.payload as unknown as Details;
          return (
            <article key={record.id} className="overflow-hidden border border-border bg-secondary">
              <button className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring" onClick={() => setSelected(record.id)}>
                <VehiclePhoto path={vehicle.photos?.[0] ?? images[vehicle.image] ?? ''} label={vehicle.name} />
                <div className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <h2 className="font-display text-2xl font-semibold">{vehicle.name}</h2>
                    <p className="text-sm text-muted-foreground">{vehicle.type} · {vehicle.cc} cm³{record.author_id === user?.id && user ? ' · Mon véhicule' : ''}</p>
                  </div>
                  <ChevronRight size={19} aria-hidden="true" />
                </div>
              </button>
            </article>
          );
        })}
      </div>
      <Dialog open={Boolean(current)} onOpenChange={open => { if (!open) setSelected(undefined); }}>
        {current && <VehicleDetails key={current.id} record={current} />}
      </Dialog>
    </CrewShell>
  );
}

function VehicleDetails({ record }: { record: CrewRecord }) {
  const { user, update, upload } = useCrew();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const vehicle = record.payload as unknown as Details;
  const editable = !user || record.author_id === user.id;
  const photos = vehicle.photos ?? [];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || saving) return;
    const form = new FormData(event.currentTarget);
    const hours = Number(form.get('hours'));
    const km = Number(form.get('km'));
    const description = String(form.get('description') ?? '').trim();
    const parts = String(form.get('parts') ?? '').trim();
    const entry = String(form.get('service') ?? '').trim();
    const files = form.getAll('photos').filter((file): file is File => file instanceof File && file.size > 0);
    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    if (!validCounter(hours) || !validCounter(km)) {
      toast.error('Vérifie les compteurs.');
      return;
    }
    if (photos.length + files.length > 8 || files.some(file => file.size > 8 * 1024 * 1024 || !extensions[file.type])) {
      toast.error('Choisis jusqu’à 8 photos JPEG, PNG ou WebP de 8 Mo maximum.');
      return;
    }
    setSaving(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) uploaded.push(await upload(file, extensions[file.type]!, 'vehicles'));
      await update(record.id, {
        ...record.payload, hours, km, description, parts, photos: [...photos, ...uploaded],
        maintenance: entry ? [...vehicle.maintenance, entry] : vehicle.maintenance,
      });
      setEditing(false);
      toast.success('Fiche enregistrée.');
    } catch {
      toast.error('La fiche n’a pas pu être enregistrée.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogTitle className="font-display text-3xl">{vehicle.name}</DialogTitle>
      <DialogDescription>{vehicle.type} · {vehicle.cc} cm³{vehicle.owner ? ' · ' + vehicle.owner : ''}</DialogDescription>
      {!editing ? <>
        <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-xl">
          {(photos.length ? photos : [images[vehicle.image] ?? '']).map((path, index) => (
            <div key={path || index} className={photos.length < 2 ? 'col-span-2' : ''}><VehiclePhoto path={path} label={vehicle.name} /></div>
          ))}
        </div>
        {vehicle.description && <section><h3 className="font-semibold">Description</h3><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{vehicle.description}</p></section>}
        {vehicle.parts && <section><h3 className="font-semibold">Pièces et équipement</h3><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{vehicle.parts}</p></section>}
        {editable && <>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p className="flex items-center gap-2"><Timer size={16} /> {vehicle.hours} h moteur</p>
            <p className="flex items-center gap-2"><Gauge size={16} /> {vehicle.km} km</p>
          </div>
          <section><h3 className="flex items-center gap-2 font-semibold"><Wrench size={16} /> Entretien</h3>
            {vehicle.alert && <p className="text-sm text-muted-foreground">{vehicle.alert}</p>}
            {vehicle.maintenance.map((entry, index) => <p key={index} className="text-sm">{entry}</p>)}
          </section>
          <Button onClick={() => setEditing(true)}>Modifier la fiche</Button>
        </>}
      </> : (
        <form className="grid gap-3" onSubmit={save}>
          <label className="grid gap-1">Description<textarea name="description" maxLength={1200} defaultValue={vehicle.description} /></label>
          <label className="grid gap-1">Pièces et équipement<textarea name="parts" maxLength={1200} defaultValue={vehicle.parts} placeholder="Ex. Pneus, suspensions, échappement…" /></label>
          <label className="grid gap-1">Ajouter des photos<input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">Heures moteur<input type="number" name="hours" min={0} step="0.1" required defaultValue={vehicle.hours} /></label>
            <label className="grid gap-1">Kilométrage<input type="number" name="km" min={0} required defaultValue={vehicle.km} /></label>
          </div>
          <label className="grid gap-1">Ajouter un entretien<input name="service" maxLength={120} placeholder="Ex. Vidange · 125 h" /></label>
          <div className="flex gap-2">
            <Button disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Annuler</Button>
          </div>
        </form>
      )}
    </DialogContent>
  );
}
