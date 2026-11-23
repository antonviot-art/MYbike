import { useEffect, useRef, useState } from 'react';

type Frame = { zoom: number; x: number; y: number };
const initial: Frame = { zoom: 1, x: 50, y: 50 };

export async function loadPhoto(file: Blob) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Cette photo ne peut pas être lue. Essaie un fichier JPEG ou PNG.'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawCrop(canvas: HTMLCanvasElement, image: HTMLImageElement, frame: Frame) {
  const size = Math.min(image.naturalWidth, image.naturalHeight) / frame.zoom;
  const x = (image.naturalWidth - size) * frame.x / 100;
  const y = (image.naturalHeight - size) * frame.y / 100;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Le recadrage est indisponible.');
  ctx.drawImage(image, x, y, size, size, 0, 0, canvas.width, canvas.height);
}

export function jpeg(canvas: HTMLCanvasElement, quality = 0.87) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob =>
    blob ? resolve(blob) : reject(new Error('La photo ne peut pas être préparée.')), 'image/jpeg', quality));
}

export async function croppedAvatar(file: File, values: FormData) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 768;
  const bound = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(values.get(key) ?? fallback);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  };
  drawCrop(canvas, await loadPhoto(file), {
    zoom: bound('avatarZoom', 1, 1, 4), x: bound('avatarX', 50, 0, 100), y: bound('avatarY', 50, 0, 100),
  });
  return jpeg(canvas);
}

export function AvatarCropFields() {
  const [image, setImage] = useState<HTMLImageElement>();
  const [frame, setFrame] = useState(initial);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const pending = useRef(0);

  useEffect(() => {
    if (canvas.current && image) drawCrop(canvas.current, image, frame);
  }, [image, frame]);

  return <div className="grid gap-2">
    <label className="grid gap-2 text-sm">Photo de profil
      <input name="avatar" type="file" accept="image/*,.heic,.heif" onChange={async event => {
        const selection = ++pending.current;
        const file = event.currentTarget.files?.[0];
        const input = event.currentTarget;
        setImage(undefined);
        setError('');
        setFrame(initial);
        if (!file) return;
        try {
          if (file.size > 30 * 1024 * 1024) throw new Error('Choisis une photo de moins de 30 Mo.');
          const decoded = await loadPhoto(file);
          if (selection === pending.current) setImage(decoded);
        } catch (failure) {
          if (selection !== pending.current) return;
          input.value = '';
          setError(failure instanceof Error ? failure.message : 'Photo indisponible.');
        }
      }} />
    </label>
    {image && <>
      <canvas ref={canvas} width={220} height={220} className="mx-auto w-40 rounded-full" aria-label="Aperçu du recadrage" />
      <div className="grid gap-2">
        <label className="grid gap-1 text-sm">Zoom<input name="avatarZoom" type="range" min="1" max="4" step=".05" value={frame.zoom} onChange={event => setFrame({ ...frame, zoom: Number(event.target.value) })} /></label>
        <label className="grid gap-1 text-sm">Position horizontale<input name="avatarX" type="range" min="0" max="100" value={frame.x} onChange={event => setFrame({ ...frame, x: Number(event.target.value) })} /></label>
        <label className="grid gap-1 text-sm">Position verticale<input name="avatarY" type="range" min="0" max="100" value={frame.y} onChange={event => setFrame({ ...frame, y: Number(event.target.value) })} /></label>
      </div>
    </>}
    {error && <p role="alert" className="text-sm text-primary">{error}</p>}
  </div>;
}
