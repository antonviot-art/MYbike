import { useEffect, useRef, useState } from 'react';
import { Mic, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Recognition = {
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function VehicleDescription({ initial, model }: { initial: string; model: string }) {
  const [description, setDescription] = useState(initial);
  const [notes, setNotes] = useState('');
  const [mic, setMic] = useState(false);
  const [status, setStatus] = useState('');
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => () => {
    if (recognition.current) {
      recognition.current.onend = null;
      recognition.current.onerror = null;
      recognition.current.onresult = null;
      recognition.current.abort();
    }
  }, []);

  function dictate() {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const speech = window as SpeechWindow;
    const Constructor = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!Constructor) {
      setStatus('La dictée n’est pas disponible dans ce navigateur. Tu peux saisir tes notes.');
      return;
    }
    const instance = new Constructor();
    instance.lang = 'fr-FR';
    instance.onresult = event => {
      const transcript = Array.from(event.results, result => result[0]?.transcript ?? '').join(' ').trim();
      setNotes(previous => (previous ? previous + ' ' + transcript : transcript).slice(0, 950));
    };
    instance.onerror = () => setStatus('La dictée a échoué. Vérifie l’autorisation du micro ou saisis tes notes.');
    instance.onend = () => { recognition.current = null; setMic(false); };
    try {
      instance.start();
      recognition.current = instance;
      setMic(true);
      setStatus('');
    } catch {
      setStatus('Impossible de démarrer la dictée.');
    }
  }

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
      {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
    </div>
  </div>;
}
