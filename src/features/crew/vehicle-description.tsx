import { useState } from 'react';
import { Mic, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { useFrenchDictation } from './use-french-dictation';

export function VehicleDescription({ initial, model }: { initial: string; model: string }) {
  const [description, setDescription] = useState(initial);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const { mic, error, dictate } = useFrenchDictation(text =>
    setNotes(previous => (previous ? previous + ' ' + text : text).slice(0, 950)),
  );
  function draft() {
    const sentences = notes.trim().replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/);
    const details = sentences.map(sentence => {
      const text = sentence.charAt(0).toUpperCase() + sentence.slice(1);
      return /[.!?]$/.test(text) ? text : text + '.';
    }).join(' ');
    const introduction = 'Ma ' + model + '.';
    setDescription((introduction + '\n\n' + details).slice(0, 1200));
    setStatus('Brouillon ajouté. Tu peux le modifier avant d’enregistrer.');
  }

  return <div className="grid gap-3">
    <label className="grid gap-1">Description
      <textarea name="description" rows={5} maxLength={1200} value={description} onChange={event => setDescription(event.target.value)} />
    </label>
    <div className="grid gap-2 rounded-xl border border-border p-3">
      <label className="grid gap-1">Notes sur ta moto
        <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Ex. J’ai monté des pneus enduro et changé le filtre à air." maxLength={950} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={dictate}><Mic /> {mic ? 'Arrêter la dictée' : 'Dicter mes notes'}</Button>
        <Button type="button" variant="secondary" disabled={!notes.trim() || mic} onClick={draft}><WandSparkles /> Préparer un brouillon</Button>
      </div>
      {(error || status) && <p role="status" className="text-sm text-muted-foreground">{error || status}</p>}
    </div>
  </div>;
}
