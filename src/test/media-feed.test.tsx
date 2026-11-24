import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { MediaPage } from '@/features/crew/media';

const { add } = vi.hoisted(() => ({ add: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/features/crew/context', () => ({
  useCrew: () => ({ records: [], name: 'Pilote', add, upload: vi.fn(), refresh: vi.fn() }),
  resolveMedia: vi.fn(),
}));
vi.mock('@/features/crew/shell', () => ({
  CrewShell: ({ children }: { children: ReactNode }) => <div>{children}</div>, Avatar: () => null,
}));

it('sends the like and comment for the selected post', async () => {
  render(<MediaPage />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Aimer' })[0]!);
  await waitFor(() => expect(add).toHaveBeenCalledWith('media-like', { post: 'ride', liked: true }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Commentaires' })[0]!);
  fireEvent.change(screen.getByRole('textbox', { name: 'Ton commentaire' }), { target: { value: 'Super sortie !' } });
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  await waitFor(() => expect(add).toHaveBeenCalledWith('media-comment', { post: 'ride', text: 'Super sortie !', name: 'Pilote' }));
});
