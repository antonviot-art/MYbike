import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function GpxImport({ disabled, label, onImport, reading, onReading }: {
  disabled: boolean;
  label: string;
  onImport: (text: string) => void;
  reading: boolean;
  onReading: (reading: boolean) => void;
}) {
  const maxBytes = 15 * 1024 * 1024;

  async function read(source: () => Promise<string>) {
    onReading(true);
    try {
      const text = await source();
      if (text.length > maxBytes) throw new Error('Choisis un GPX de moins de 15 Mo.');
      onImport(text);
    } catch (error) {
      toast.error(error instanceof Error && error.name === 'Error'
        ? error.message : 'Lecture impossible. Tu peux importer le fichier GPX à la place.');
    } finally {
      onReading(false);
    }
  }

  return <div className="grid gap-2">
    <label className="grid gap-1">{reading ? 'Lecture du GPX…' : label}
      <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" disabled={disabled || reading} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;
        if (file.size > maxBytes) { toast.error('Choisis un GPX de moins de 15 Mo.'); return; }
        void read(() => file.text());
      }} />
    </label>
      <Button variant="outline" size="sm" className="justify-self-start" disabled={disabled || reading} onClick={() => void read(() => {
        if (!navigator.clipboard?.readText) throw new Error('Le presse-papiers est indisponible. Importe le fichier GPX à la place.');
        return navigator.clipboard.readText();
      })}>Coller une trace GPX</Button>
      <details>
        <summary className="cursor-pointer">Transférer sans passer par Fichiers sur iPhone</summary>
        <p>Dans Raccourcis, crée un raccourci affiché dans la feuille de partage qui accepte les fichiers. Ajoute les actions pour obtenir le texte de l’entrée, puis le copier dans le presse-papiers. Dans Open GPX Tracker, partage la trace vers ce raccourci, puis reviens ici et touche « Coller une trace GPX ».</p>
      </details>
  </div>;
}
