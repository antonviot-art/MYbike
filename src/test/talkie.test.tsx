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

describe('Talkie', () => {
  it('records while the control is held and sends only on release', async () => {
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

    render(<ChatPage talkie />);
    fireEvent.click(screen.getByRole('button', { name: 'Général' }));
    const talk = screen.getByRole('button', { name: 'Maintiens pour parler' });
    fireEvent.keyDown(talk, { key: ' ' });
    await screen.findByRole('button', { name: 'Relâche pour envoyer' });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(add).not.toHaveBeenCalled();

    fireEvent.keyUp(talk, { key: ' ' });
    await waitFor(() => expect(add).toHaveBeenCalledWith('message', expect.objectContaining({ room: 'general', audio: 'blob:recorded' })));
    expect(stopTrack).toHaveBeenCalled();
  });
});
