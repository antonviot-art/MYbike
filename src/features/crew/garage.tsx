import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Bike, ChevronLeft, ChevronRight, Gauge, Pencil, Timer, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { Link, useNavigate } from '@tanstack/react-router';
import { jpeg, loadPhoto } from './photo-crop';
import { VehicleDescription } from './vehicle-description';
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

function VehicleGallery({ photos, label }: { photos: string[]; label: string }) {
  const [carousel, setCarousel] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!carousel) return;
    const sync = () => setIndex(carousel.selectedScrollSnap());
    sync();
    carousel.on('select', sync).on('reInit', sync);
    return () => { carousel.off('select', sync).off('reInit', sync); };
  }, [carousel]);

  if (photos.length <= 1) {
    return <div className="vehicle-gallery overflow-hidden rounded-2xl"><VehiclePhoto path={photos[0] ?? ''} label={label} /></div>;
  }

  return (
    <Carousel setApi={setCarousel} className="vehicle-gallery min-w-0" aria-label={'Photos de ' + label}>
      <div className="overflow-hidden rounded-2xl bg-card">
        <CarouselContent className="ml-0">
          {photos.map((path, slide) => (
            <CarouselItem className="pl-0" key={path} aria-label={`Photo ${slide + 1} sur ${photos.length}`}>
              {Math.abs(index - slide) <= 1
                ? <VehiclePhoto path={path} label={`${label}, photo ${slide + 1}`} />
                : <div className="vehicle-photo bg-card" aria-hidden="true" />}
            </CarouselItem>
          ))}
        </CarouselContent>
      </div>
      <div className="mt-2 flex items-center justify-center gap-3">
        <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Photo précédente"
          disabled={!carousel || index === 0} onClick={() => carousel?.scrollPrev()}><ChevronLeft /></Button>
        <span role="status" className="min-w-12 text-center text-sm tabular-nums text-muted-foreground">{index + 1} / {photos.length}</span>
        <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Photo suivante"
          disabled={!carousel || index >= photos.length - 1} onClick={() => carousel?.scrollNext()}><ChevronRight /></Button>
      </div>
    </Carousel>
  );
}

type Details = Vehicle & { description?: string; parts?: string; photos?: string[] };

export function GaragePage() {
  const { records, user } = useCrew();
  const vehicles = records.filter(record => record.kind === 'vehicle');

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
              <Link to="/vehicules/$vehicleId" params={{ vehicleId: record.id }} className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring">
                <VehiclePhoto path={vehicle.photos?.[0] ?? images[vehicle.image] ?? ''} label={vehicle.name} />
                <div className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <h2 className="font-display text-2xl font-semibold">{vehicle.name}</h2>
                    <p className="text-sm text-muted-foreground">{vehicle.type}{vehicle.cc > 0 && ' · ' + vehicle.cc + ' cm³'}{record.author_id === user?.id && user ? ' · Mon véhicule' : ''}</p>
                  </div>
                  <ChevronRight size={19} aria-hidden="true" />
                </div>
              </Link>
            </article>
          );
        })}
      </div>
    </CrewShell>
  );
}

export function VehiclePage({ vehicleId }: { vehicleId: string }) {
  const { records, loading } = useCrew();
  const record = records.find(item => item.kind === 'vehicle' && item.id === vehicleId);
  return <CrewShell tab="Véhicules">
    <Button asChild variant="outline" size="icon" className="mb-4 rounded-full">
      <Link to="/vehicules" aria-label="Retour au garage" title="Retour au garage"><ArrowLeft /></Link>
    </Button>
    {record ? <VehicleDetails key={record.id} record={record} /> : <p>{loading ? 'Chargement de la fiche…' : 'Véhicule introuvable.'}</p>}
  </CrewShell>;
}

function VehicleDetails({ record }: { record: CrewRecord }) {
  const { user, update, remove, upload } = useCrew();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const vehicle = record.payload as unknown as Details;
  const editable = !user || record.author_id === user.id;
  const photos = vehicle.photos ?? [];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || saving) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const type = String(form.get('type') ?? '').trim();
    const cc = Number(form.get('cc'));
    const hours = Number(form.get('hours'));
    const km = Number(form.get('km'));
    const description = String(form.get('description') ?? '').trim();
    const parts = String(form.get('parts') ?? '').trim();
    const entry = String(form.get('service') ?? '').trim();
    const alert = String(form.get('alert') ?? '').trim();
    const removed = new Set(form.getAll('removePhoto'));
    const kept = photos.filter(path => !removed.has(path));
    const files = form.getAll('photos').filter((file): file is File => file instanceof File && file.size > 0);
    if (!name || !type || !Number.isInteger(cc) || cc < 0 || !validCounter(hours) || !validCounter(km)) {
      toast.error('Vérifie le modèle, le type, la cylindrée et les compteurs.');
      return;
    }
    if (kept.length + files.length > 32 || files.some(file => file.size > 30 * 1024 * 1024)) {
      toast.error('Choisis jusqu’à 32 photos de 30 Mo maximum chacune.');
      return;
    }
    setSaving(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const image = await loadPhoto(file);
        const factor = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Impossible de préparer une photo.');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        uploaded.push(await upload(await jpeg(canvas), 'jpg', 'vehicles'));
      }
      await update(record.id, {
        ...record.payload, name, type, cc, hours, km, description, parts, alert, photos: [...kept, ...uploaded],
        maintenance: entry ? [...vehicle.maintenance, entry] : vehicle.maintenance,
      });
      setEditing(false);
      toast.success('Fiche enregistrée.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'La fiche n’a pas pu être enregistrée.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteVehicle() {
    if (!editable || saving) return;
    setSaving(true);
    try {
      await remove(record.id);
      toast.success('Véhicule supprimé.');
      await navigate({ to: '/vehicules', replace: true });
    } catch {
      toast.error('Le véhicule n’a pas pu être supprimé.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="vehicle-detail mx-auto grid max-w-5xl gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-5xl font-semibold">{vehicle.name}</h2>
          <p className="text-muted-foreground">{vehicle.type}{vehicle.cc > 0 && ' · ' + vehicle.cc + ' cm³'}
            {record.author_id && <Link className="ml-2 underline" to="/pilotes/$pilotId" params={{ pilotId: record.author_id }}>{vehicle.owner || 'Voir le profil'}</Link>}
          </p>
        </div>
        {editable && !editing && <Button className="w-full sm:w-auto" onClick={() => { setEditing(true); setConfirmDelete(false); }}><Pencil /> Modifier la fiche</Button>}
      </header>
      {!editing ? <>
        <VehicleGallery photos={photos.length ? photos : [images[vehicle.image] ?? '']} label={vehicle.name} />
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
          {confirmDelete ? <div className="grid gap-2">
            <p>Supprimer ce véhicule et sa fiche ?</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" disabled={saving} onClick={deleteVehicle}>Confirmer la suppression</Button>
              <Button variant="outline" disabled={saving} onClick={() => setConfirmDelete(false)}>Annuler</Button>
            </div>
          </div> : <Button variant="outline" className="justify-self-start" onClick={() => setConfirmDelete(true)}>Supprimer ce véhicule</Button>}
        </>}
      </> : (
        <form className="grid gap-3" onSubmit={save}>
          <label className="grid gap-1">Marque et modèle<input name="name" maxLength={80} required defaultValue={vehicle.name} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">Type<input name="type" maxLength={40} required defaultValue={vehicle.type} /></label>
            <label className="grid gap-1">Cylindrée (cm³)<input name="cc" type="number" min={1} step={1} defaultValue={vehicle.cc || ''} /></label>
          </div>
          <VehicleDescription initial={vehicle.description ?? ''} model={vehicle.name} />
          <label className="grid gap-1">Pièces et équipement<textarea name="parts" maxLength={1200} defaultValue={vehicle.parts} placeholder="Ex. Pneus, suspensions, échappement…" /></label>
          <label className="grid gap-1">Ajouter des photos<input className="w-full max-w-full text-sm" type="file" name="photos" multiple accept="image/*,.heic,.heif" /><span className="text-sm text-muted-foreground">Jusqu’à 32 photos dans la fiche.</span></label>
          {photos.length > 0 && <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <legend className="mb-2">Photos actuelles</legend>
            {photos.map((path, index) => <label key={path} className="grid gap-1 text-sm">
              <VehiclePhoto path={path} label={'Photo ' + (index + 1)} />
              <span><input type="checkbox" name="removePhoto" value={path} /> Retirer</span>
            </label>)}
          </fieldset>}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">Heures moteur<input type="number" name="hours" min={0} step="0.1" required defaultValue={vehicle.hours} /></label>
            <label className="grid gap-1">Kilométrage<input type="number" name="km" min={0} required defaultValue={vehicle.km} /></label>
          </div>
          <label className="grid gap-1">Ajouter un entretien<input name="service" maxLength={120} placeholder="Ex. Vidange · 125 h" /></label>
          <label className="grid gap-1">Rappel d’entretien<input name="alert" maxLength={120} defaultValue={vehicle.alert} /></label>
          <div className="vehicle-edit-actions flex flex-wrap gap-2">
            <Button disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Annuler</Button>
          </div>
        </form>
      )}
    </article>
  );
}
