import { useEffect, useRef, useState } from 'react';

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

export function useFrenchDictation(onText: (text: string) => void) {
  const [mic, setMic] = useState(false);
  const [error, setError] = useState('');
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => () => {
    const current = recognition.current;
    if (current) {
      current.onend = current.onerror = current.onresult = null;
      current.abort();
    }
  }, []);

  function dictate() {
    if (recognition.current) { recognition.current.stop(); return; }
    const speech = window as SpeechWindow;
    const Constructor = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!Constructor) {
      setError('La dictée est indisponible dans ce navigateur. Tu peux écrire ton texte.');
      return;
    }
    const instance = new Constructor();
    instance.lang = 'fr-FR';
    instance.onresult = event => {
      const transcript = Array.from(event.results, result => result[0]?.transcript ?? '').join(' ').trim();
      if (transcript) onText(transcript);
    };
    instance.onerror = () => setError('La dictée a échoué. Vérifie l’autorisation du microphone.');
    instance.onend = () => { recognition.current = null; setMic(false); };
    try {
      instance.start();
      recognition.current = instance;
      setMic(true);
      setError('');
    } catch {
      setError('Impossible de démarrer la dictée.');
    }
  }
  return { mic, error, dictate };
}
