import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, BarChart3, Camera, Copy, MapPin, MessageSquare, Mic, Plus, Send, Square, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { resolveMedia, useCrew } from './context';
import { Avatar, CrewShell } from './shell';
import type { Message } from './data';
import { frenchRegions } from './regions';
import { socialCall, type SharedRoom } from './social';
import { croppedAvatar } from './photo-crop';

type Room = { id: string; label: string; code?: string; photo?: string };

function RoomAvatar({ room }: { room: Room }) {
  const [image, setImage] = useState<{ path: string; url: string }>();
  useEffect(() => {
    const path = room.photo;
    if (!path) return;
    let active = true;
    void resolveMedia(path).then(url => { if (active) setImage({ path, url }); }).catch(() => {});
    return () => { active = false; };
  }, [room.photo]);
  const Icon = room.id === 'general' ? MessageSquare : room.id.startsWith('region:') ? MapPin : UsersRound;
  return <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-card text-primary" aria-hidden="true">
    <Icon size={19} />
    {image && image.path === room.photo && <img className="absolute inset-0 size-full object-cover" src={image.url} alt="" onError={() => setImage(undefined)} />}
  </span>;
}

function RoomPhotoInput() {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="flex items-center gap-3">
    <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-card text-primary">
      {preview ? <img src={preview} alt="Aperçu de la photo du groupe" className="size-full object-cover" /> : <Camera size={23} aria-hidden="true" />}
    </span>
    <label className="grid min-w-0 flex-1 gap-1 text-sm">Photo du groupe (facultative)
      <input className="w-full" type="file" name="photo" accept="image/*,.heic,.heif" onChange={event => setFile(event.currentTarget.files?.[0])} />
    </label>
  </div>;
}

async function prepareRoomPhoto(form: FormData) {
  const file = form.get('photo');
  if (!(file instanceof File) || !file.size) return null;
  if (file.size > 30 * 1024 * 1024) throw new Error('Choisis une photo de moins de 30 Mo.');
  return croppedAvatar(file, form);
}

export function ChatPage() {
  const { user, records, add, refresh, upload, name } = useCrew();
  const [selected, setSelected] = useState('');
  const [menu, setMenu] = useState<'group' | 'create' | 'join' | 'photo'>();
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
  const covers = useMemo(() => {
    const images = new Map<string, string>();
    for (const record of records) {
      const roomId = record.payload['room'];
      const path = record.payload['roomCover'];
      if (record.kind !== 'message' || typeof roomId !== 'string' || typeof path !== 'string') continue;
      if (roomId.startsWith('room:') ? path.split('/').slice(1, 3).join('/') === 'rooms/' + roomId.slice(5) : path.startsWith('blob:')) {
        images.set(roomId, path);
      }
    }
    return images;
  }, [records]);
  const rooms: Room[] = ([
    { id: 'general', label: 'Général' },
    ...(frenchRegions.includes(region) ? [{ id: 'region:' + region, label: region }] : []),
    ...(userId && shared?.userId === userId ? shared.rooms.map(room => ({ ...room, id: 'room:' + room.id })) : []),
    ...(!user ? records.filter(record => record.kind === 'demo-room' && (joined.includes(record.id) || record.payload['createdHere'] === true)).map(record => ({
      id: record.id, label: String(record.payload['label']), code: String(record.payload['code']),
      ...(typeof record.payload['photo'] === 'string' && record.payload['photo'].startsWith('blob:') ? { photo: record.payload['photo'] } : {}),
    })) : []),
  ] as Room[]).map(room => {
    const photo = covers.get(room.id);
    return photo ? { ...room, photo } : room;
  });
  const current = rooms.find(room => room.id === selected);

  async function saveCover(roomId: string, photo: Blob) {
    const path = await upload(photo, 'jpg', roomId.startsWith('room:') ? 'rooms/' + roomId.slice(5) : undefined);
    await add('message', {
      room: roomId, roomCover: path, name, pilot: name.charAt(0), text: 'Photo du groupe mise à jour.',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    });
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const label = String(data.get('label') ?? '').trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      const photo = await prepareRoomPhoto(data);
      let group: string;
      if (userId) {
        const id = await socialCall('mybike_room_create', { room_label: label });
        group = 'room:' + id;
        setShared({ userId, rooms: await socialCall('mybike_rooms_list', {}) });
      } else {
        const code = crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
        await add('demo-room', { label, code, createdHere: true, ...(photo ? { photo: await upload(photo, 'jpg') } : {}) });
        toast.success('Groupe créé. Code de démo : ' + code);
        setMenu(undefined);
        return;
      }
      if (photo) {
        try { await saveCover(group, photo); }
        catch { toast.error('Groupe créé. La photo pourra être ajoutée depuis la discussion.'); }
      }
      setSelected(group);
      setMenu(undefined);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function changeRoomPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current?.code || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const photo = await prepareRoomPhoto(data);
      if (!photo) { toast.error('Choisis une photo.'); return; }
      await saveCover(current.id, photo);
      setMenu(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'La photo n’a pas été enregistrée.');
    } finally { setBusy(false); }
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
        setMenu(undefined);
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
    setMenu(undefined);
  }

  return (
    <CrewShell tab="Discussion" immersive={Boolean(current)}>
      {current ? <Conversation key={current.id} room={current} onBack={() => setSelected('')} onPhoto={() => setMenu('photo')} /> : (
        <div className="grid max-w-2xl gap-4">
          <Button size="sm" variant="outline" className="justify-self-start rounded-full" onClick={() => setMenu('group')}>
            <UsersRound /> Groupe
          </Button>
          {rooms.map(room => (
            <Button key={room.id} variant="outline" onClick={() => setSelected(room.id)} className="h-16 justify-start gap-3 px-3">
              <RoomAvatar room={room} /><span className="truncate">{room.label}</span>
            </Button>
          ))}
        </div>
      )}
      <Dialog open={Boolean(menu)} onOpenChange={open => { if (!open && !busy) setMenu(undefined); }}>
        {menu && <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
          <DialogTitle>{menu === 'group' ? 'Groupe' : menu === 'join' ? 'Rejoindre un groupe' : menu === 'create' ? 'Créer un groupe' : 'Modifier la photo du groupe'}</DialogTitle>
          {menu === 'group' ? <>
            <DialogDescription>{user ? 'Crée un groupe ou rejoins-en un avec son code.' : 'Les codes fonctionnent dans cette session de démo.'}</DialogDescription>
            <div className="grid gap-2">
              <Button onClick={() => setMenu('create')}><Plus /> Créer un groupe</Button>
              <Button variant="outline" onClick={() => setMenu('join')}>Rejoindre un groupe</Button>
            </div>
          </> : menu === 'join' ? <>
            <DialogDescription>Saisis le code partagé par un membre.</DialogDescription>
            <form className="grid gap-3" onSubmit={joinRoom}>
              <input name="code" aria-label="Code du groupe" placeholder="Code du groupe" autoCapitalize="characters" autoComplete="off" required />
              <Button disabled={busy}>Rejoindre</Button>
            </form>
            <Button variant="ghost" onClick={() => setMenu('group')} disabled={busy}>Retour</Button>
          </> : <>
          <DialogDescription>{menu === 'create' ? 'Choisis un nom et une photo, puis partage le code du groupe.' : 'Les membres du groupe verront la nouvelle photo.'}</DialogDescription>
          <form className="grid gap-4" onSubmit={menu === 'create' ? createRoom : changeRoomPhoto}>
            {menu === 'create' && <label className="grid gap-1 text-sm">Nom du groupe
              <input name="label" placeholder="Ex. Sorties du dimanche" maxLength={80} required />
            </label>}
            <RoomPhotoInput />
            <Button disabled={busy}>{busy ? 'Enregistrement…' : menu === 'create' ? 'Créer le groupe' : 'Enregistrer la photo'}</Button>
          </form>
          {menu === 'create' && <Button variant="ghost" onClick={() => setMenu('group')} disabled={busy}>Retour</Button>}
          </>}
        </DialogContent>}
      </Dialog>
    </CrewShell>
  );
}

function Conversation({ room, onBack, onPhoto }: { room: Room; onBack: () => void; onPhoto: () => void }) {
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
    (record.kind === 'poll' || (record.kind === 'message' && !record.payload['roomCover'])) &&
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
        <RoomAvatar room={room} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{room.label}</h2>
        {room.code && <Button variant="ghost" size="icon" onClick={onPhoto} aria-label="Modifier la photo du groupe"><Camera /></Button>}
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
                <p className="mb-1 text-xs text-muted-foreground">
                  {record.author_id && !own
                    ? <Link to="/pilotes/$pilotId" params={{ pilotId: record.author_id }} className="font-semibold text-foreground hover:underline">{message.name}</Link>
                    : own ? 'Toi' : message.name} · {message.time}
                </p>
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
