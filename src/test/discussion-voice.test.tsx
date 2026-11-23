import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from '@/features/crew/chat';

const { add, upload } = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue(undefined),
  upload: vi.fn().mockResolvedValue('blob:recorded'),
}));

vi.mock('@/features/crew/context', () => ({
  useCrew: () => ({ records: [], name: 'Pilote', add, upload, refresh: vi.fn() }),
  resolveMedia: vi.fn(),
}));
vi.mock('@/features/crew/shell', () => ({
  CrewShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Avatar: () => null,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Vocaux dans les discussions', () => {
  it('records on the first click and sends on the second', async () => {
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.spyOn(window, 'navigator', 'get').mockReturnValue({ mediaDevices: { getUserMedia } } as unknown as Navigator);

    class Recorder {
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;
      constructor(readonly stream: { getTracks: () => { stop: () => void }[] }) {}
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', Recorder);

    render(<ChatPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Général' }));
    const talk = screen.getByRole('button', { name: 'Enregistrer un vocal' });
    fireEvent.click(talk);
    const sendVoice = await screen.findByRole('button', { name: 'Envoyer le vocal' });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(add).not.toHaveBeenCalled();

    fireEvent.click(sendVoice);
    await waitFor(() => expect(add).toHaveBeenCalledWith('message', expect.objectContaining({ room: 'general', audio: 'blob:recorded' })));
    expect(stopTrack).toHaveBeenCalled();
  });
});

it('opens the group configuration before creating a discussion', async () => {
  add.mockClear();
  render(<ChatPage />);
  expect(screen.queryByRole('textbox', { name: 'Nom du groupe' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Groupe$/ }));
  expect(screen.getByRole('button', { name: 'Rejoindre un groupe' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Créer un groupe' }));
  expect(screen.getByRole('dialog', { name: 'Créer un groupe' })).toBeInTheDocument();
  expect(screen.getByLabelText('Photo du groupe (facultative)')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Nom du groupe' }), { target: { value: 'Sorties moto' } });
  fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
  await waitFor(() => expect(add).toHaveBeenCalledWith('demo-room', expect.objectContaining({ label: 'Sorties moto' })));
});
