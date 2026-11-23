import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, BarChart3, Copy, MapPin, MessageSquare, Mic, Send, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { resolveMedia, useCrew } from './context';
import { Avatar, CrewShell } from './shell';
import type { Message } from './data';
import { frenchRegions } from './regions';
import { socialCall, type SharedRoom } from './social';

type Room = { id: string; label: string; code?: string };

export function ChatPage() {
  const { user, records, add, refresh } = useCrew();
  const [selected, setSelected] = useState('');
  const [shared, setShared] = useState<{ userId: string; rooms: SharedRoom[] }>();
  const [busy, setBusy] = useState(false);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    socialCall('mybike_rooms_list', {}).then(rooms => {
      if (active) setShared({ userId, rooms });
    }).catch(error => { if (active) toast.error(error.message); });
    return () => { active = false; };
  }, [userId]);
  const [joined, setJoined] = useState<string[]>([]);
  const region = user ? String(user.user_metadata['region'] ?? '') : 'Grand Est';
  const rooms: Room[] = [
    { id: 'general', label: 'Général' },
    ...(frenchRegions.includes(region) ? [{ id: 'region:' + region, label: region }] : []),
    ...(userId && shared?.userId === userId ? shared.rooms.map(room => ({ ...room, id: 'room:' + room.id })) : []),
    ...(!user ? records.filter(record => record.kind === 'demo-room' && (joined.includes(record.id) || record.payload['createdHere'] === true)).map(record => ({
      id: record.id, label: String(record.payload['label']), code: String(record.payload['code']),
    })) : []),
  ];
  const current = rooms.find(room => room.id === selected);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const label = String(new FormData(form).get('label') ?? '').trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      if (userId) {
        const id = await socialCall('mybike_room_create', { room_label: label });
        setShared({ userId, rooms: await socialCall('mybike_rooms_list', {}) });
        setSelected('room:' + id);
      } else {
        const code = crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
        await add('demo-room', { label, code, createdHere: true });
        toast.success('Groupe créé. Code de démo : ' + code);
      }
      form.reset();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const code = String(new FormData(event.currentTarget).get('code') ?? '').trim().toUpperCase();
    if (userId) {
      setBusy(true);
      try {
        const id = await socialCall('mybike_room_join', { room_code: code });
        setShared({ userId, rooms: await socialCall('mybike_rooms_list', {}) });
        await refresh();
        setSelected('room:' + id);
      } catch (error) {
        toast.error(String(error));
      } finally {
        setBusy(false);
      }
      return;
    }
    const match = records.find(record => record.kind === 'demo-room' && record.payload['code'] === code);
    if (!match) {
      toast.error('Code inconnu dans cette session de démo.');
      return;
    }
    setJoined(previous => [...new Set([...previous, match.id])]);
    setSelected(match.id);
  }

  return (
    <CrewShell tab="Discussion" immersive={Boolean(current)}>
      {current ? <Conversation key={current.id} room={current} onBack={() => setSelected('')} /> : (
        <div className="grid max-w-2xl gap-4">
          {rooms.map(room => (
            <Button key={room.id} variant="outline" onClick={() => setSelected(room.id)} className="h-14 justify-start px-4">
              {room.id === 'general' ? <MessageSquare /> : <MapPin />} {room.label}
            </Button>
          ))}
            <section className="chat-panel grid gap-4 p-4">
              <h2 className="font-semibold">{user ? "Discussions par code" : "Groupes de démo"}</h2>
              {!user && <p className="text-sm text-muted-foreground">Les codes fonctionnent dans cette session de démo.</p>}
              <form className="flex flex-wrap gap-2" onSubmit={createRoom}>
                <input className="min-w-0 flex-1" name="label" aria-label="Nom du groupe" placeholder="Nom du groupe" maxLength={80} required />
                <Button disabled={busy}>Créer une discussion</Button>
              </form>
              <form className="flex flex-wrap gap-2" onSubmit={joinRoom}>
                <input className="min-w-0 flex-1" name="code" aria-label="Code du groupe" placeholder="Code du groupe" required />
                <Button disabled={busy} variant="secondary">Rejoindre une discussion</Button>
              </form>
            </section>
        </div>
      )}
    </CrewShell>
  );
}

function Conversation({ room, onBack }: { room: Room; onBack: () => void }) {
  const { records, add, name, upload, user } = useCrew();
  const [text, setText] = useState('');
  const [pollOpen, setPollOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micPending, setMicPending] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const micOpening = useRef(false);
  const active = useRef(false);
  const feed = useRef<HTMLDivElement>(null);
  const voter = user?.id ?? 'demo';
  const entries = useMemo(() => records.filter(record =>
    (record.kind === 'message' || record.kind === 'poll') &&
    (record.payload['room'] ?? 'general') === room.id), [records, room.id]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      const current = recorder.current;
      if (current?.state === 'recording') current.stop();
      current?.stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [entries.length]);

  function post(body: Record<string, unknown>) {
    return add('message', {
      room: room.id, name, pilot: name.charAt(0), ...body,
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    });
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    try {
      await post({ text: text.trim() });
      setText('');
    } catch {
      toast.error('Le message n’a pas été envoyé.');
    }
  }

  async function publishPoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const question = String(form.get('question') ?? '').trim();
    const options = [...new Set(String(form.get('options') ?? '').split('\n').map(option => option.trim()).filter(Boolean))];
    if (!question || options.length < 2 || options.length > 8) {
      toast.error('Indique une question et entre 2 et 8 réponses distinctes.');
      return;
    }
    try {
      await add('poll', { room: room.id, question, options, name });
      setPollOpen(false);
    } catch {
      toast.error('Le sondage n’a pas été publié.');
    }
  }

  async function recordVoice() {
    if (recorder.current?.state === 'recording') {
      recorder.current.stop();
      return;
    }
    if (micOpening.current) return;
    micOpening.current = true;
    setMicPending(true);
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const capture = new MediaRecorder(stream);
      recorder.current = capture;
      const chunks: Blob[] = [];
      capture.ondataavailable = event => chunks.push(event.data);
      capture.onstop = async () => {
        capture.stream.getTracks().forEach(track => track.stop());
        if (!active.current) return;
        setRecording(false);
        try {
          const extension = capture.mimeType.includes('mp4') ? 'm4a' : capture.mimeType.includes('ogg') ? 'ogg' : 'webm';
          const clip = new Blob(chunks, { type: capture.mimeType });
          if (!clip.size) return;
          const audio = await upload(clip, extension, room.id.startsWith('room:') ? 'rooms/' + room.id.slice(5) : undefined);
          await post({ text: 'Message vocal', audio });
        } catch {
          toast.error('Le vocal n’a pas été envoyé.');
        }
      };
      capture.start();
      setRecording(true);
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      toast.error('Microphone indisponible. Vérifie les autorisations.');
    } finally {
      micOpening.current = false;
      if (active.current) setMicPending(false);
    }
  }

  return (
    <section className="conversation-screen" aria-label="Conversation">
      <header className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Toutes les discussions"><ArrowLeft /></Button>
        <h2 className="flex-1 text-lg font-semibold">{room.label}</h2>
        {room.code && <div className="flex items-center gap-2 text-sm">
          <span>Code <code className="select-all">{room.code}</code></span>
          <Button variant="ghost" size="icon" aria-label="Copier le code de la discussion" onClick={async () => {
            try {
              await navigator.clipboard.writeText(room.code!);
              toast.success('Code copié.');
            } catch {
              toast.error('Sélectionne le code pour le copier manuellement.');
            }
          }}><Copy /></Button>
        </div>}
      </header>
      <div className="chat-feed" ref={feed}>
        {!entries.length && <p className="text-muted-foreground">Aucun message pour le moment.</p>}
        {entries.map(record => {
          if (record.kind === 'poll') {
            const options = record.payload['options'];
            if (!Array.isArray(options) || !options.every(option => typeof option === 'string')) return null;
            const votes = new Map(records.filter(item => item.kind === 'poll-vote' && item.payload['poll'] === record.id &&
              (item.payload['room'] ?? 'general') === room.id)
              .map(item => [String(item.payload['voter']), String(item.payload['option'])]));
            return (
              <article key={record.id} className="mb-4 rounded-lg border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Sondage · {String(record.payload['name'])}</p>
                <h3 className="my-2 font-semibold">{String(record.payload['question'])}</h3>
                <div className="grid gap-2">
                  {options.map(option => (
                    <Button key={option} variant={votes.get(voter) === option ? 'default' : 'outline'} aria-pressed={votes.get(voter) === option} className="h-auto justify-between whitespace-normal text-left"
                      onClick={() => void add('poll-vote', { room: room.id, poll: record.id, voter, option }).catch(() => toast.error('Le vote n’a pas été enregistré.'))}>
                      {option}<span>{[...votes.values()].filter(value => value === option).length}</span>
                    </Button>
                  ))}
                </div>
              </article>
            );
          }
          const message = record.payload as unknown as Message;
          const own = user ? record.author_id === user.id : message.name === name;
          return (
            <div key={record.id} className={`mb-4 flex items-end gap-2 ${own ? 'flex-row-reverse' : ''}`}>
              {record.author_id ? <Link to="/pilotes/$pilotId" params={{ pilotId: record.author_id }} aria-label={'Voir le profil de ' + message.name}>
                <Avatar pilot={message.pilot} userId={record.author_id} />
              </Link> : <Avatar pilot={message.pilot} />}
              <div className={`min-w-0 max-w-[80%] ${own ? 'text-right' : ''}`}>
                <p className="mb-1 text-xs text-muted-foreground">{own ? 'Toi' : message.name} · {message.time}</p>
                <div className={`bubble max-w-full break-words text-left ${own ? 'bubble-own' : ''}`}>{message.audio ? <VoiceMessage path={message.audio} /> : message.text}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="conversation-compose border-t border-border p-3"><form className="flex items-center gap-2" onSubmit={send}>
          <input className="w-0 flex-1" aria-label="Ton message" placeholder="Écris un message…" value={text} onChange={event => setText(event.target.value)} />
          <Button type="button" variant="ghost" size="icon" aria-label={recording ? 'Envoyer le vocal' : 'Enregistrer un vocal'} disabled={micPending} onClick={recordVoice}>{recording ? <Square /> : <Mic />}</Button>
          <Button type="submit" size="icon" disabled={!text.trim()} aria-label="Envoyer le message"><Send /></Button>
        </form>
        {recording && <p role="status" className="mt-2 text-sm">Enregistrement en cours…</p>}
        <Button type="button" variant="ghost" className="mt-2" aria-expanded={pollOpen} onClick={() => setPollOpen(!pollOpen)}><BarChart3 /> Sondage</Button>
        {pollOpen && (
          <form className="mt-2 grid gap-3" onSubmit={publishPoll}>
            <label className="grid gap-1">Question<input name="question" maxLength={160} required /></label>
            <label className="grid gap-1">Réponses (une par ligne)<textarea name="options" maxLength={480} required /></label>
            <Button>Publier le sondage</Button>
          </form>
        )}
      </div>
    </section>
  );
}

function VoiceMessage({ path }: { path: string }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    resolveMedia(path).then(value => { if (active) setUrl(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [path]);
  return url ? <audio controls src={url} className="w-56 max-w-full" /> : <span>{failed ? 'Vocal indisponible' : 'Chargement du vocal…'}</span>;
}
