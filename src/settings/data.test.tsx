import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryVireApi } from '@/api/memory-api';
import { ApiError, type VireApi } from '@/api/types';
import { t } from '@/content/strings';
import type { Profile } from '@/domain/schema';
import { DataSection } from './DataSection';

const PROFILE: Profile = {
  name: 'Aino',
  sex: 'f',
  age: 35,
  h: 170,
  w: 80,
  goalW: 72,
  act: 1.375,
  pace: 500,
  city: 'Helsinki',
  allergies: '',
  waterMl: 2000,
  target: 1600,
  timezone: 'Europe/Helsinki',
};

function setup(api: VireApi = new MemoryVireApi(PROFILE)) {
  const onDeleted = vi.fn();
  const download = vi.fn();
  render(<DataSection api={api} onDeleted={onDeleted} download={download} />);
  return { onDeleted, download, user: userEvent.setup(), api };
}

/** Walk to the confirmation step. */
async function askToDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: t.settings.deleteAction }));
}

describe('export', () => {
  it('hands the whole export to the browser as a file', async () => {
    const { user, download } = setup();
    await user.click(screen.getByRole('button', { name: t.settings.exportAction }));

    await waitFor(() => expect(download).toHaveBeenCalled());
    const [filename, data] = download.mock.calls[0]!;
    expect(filename).toBe(t.settings.exportFilename);
    expect(data).toMatchObject({ v: 1 });
  });

  it('includes the profile in what it downloads', async () => {
    const { user, download } = setup();
    await user.click(screen.getByRole('button', { name: t.settings.exportAction }));

    await waitFor(() => expect(download).toHaveBeenCalled());
    const data = download.mock.calls[0]![1] as { items: { sk: string }[] };
    expect(data.items.map((item) => item.sk)).toContain('PROFILE');
  });

  it('reports a failure rather than downloading nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api: VireApi = Object.assign(new MemoryVireApi(PROFILE), {
      exportData: async () => {
        throw new ApiError(0, 'network');
      },
    });
    const { user, download } = setup(api);
    await user.click(screen.getByRole('button', { name: t.settings.exportAction }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(t.settings.exportFailed),
    );
    expect(download).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('deleting the account', () => {
  it('does not offer the button until asked', () => {
    setup();
    expect(
      screen.queryByRole('button', { name: t.settings.deleteConfirmAction }),
    ).not.toBeInTheDocument();
  });

  it('states exactly what goes, and that it cannot be undone', async () => {
    const { user } = setup();
    await askToDelete(user);
    expect(screen.getByText(t.settings.deleteWarning)).toBeInTheDocument();
  });

  it('keeps the confirm button out of reach until the word is typed', async () => {
    // A typed word rather than a second tap: there is no undo.
    const { user } = setup();
    await askToDelete(user);

    const confirm = screen.getByRole('button', { name: t.settings.deleteConfirmAction });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/Type DELETE/), 'delet');
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/Type DELETE/), 'e');
    expect(confirm).toBeEnabled();
  });

  it('deletes everything and signs the user out', async () => {
    const { user, onDeleted, api } = setup();
    await askToDelete(user);
    await user.type(screen.getByLabelText(/Type DELETE/), 'DELETE');
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirmAction }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(await api.getProfile()).toBeNull();
  });

  it('backs out without deleting anything', async () => {
    const { user, onDeleted, api } = setup();
    await askToDelete(user);
    await user.type(screen.getByLabelText(/Type DELETE/), 'DELETE');
    await user.click(screen.getByRole('button', { name: t.settings.deleteCancel }));

    expect(onDeleted).not.toHaveBeenCalled();
    expect(await api.getProfile()).not.toBeNull();
    // And the typed word is cleared, so coming back does not start half-confirmed.
    await askToDelete(user);
    expect(screen.getByRole('button', { name: t.settings.deleteConfirmAction })).toBeDisabled();
  });

  it('promises nothing was removed only when nothing was', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api: VireApi = Object.assign(new MemoryVireApi(PROFILE), {
      deleteAccount: async () => {
        throw new ApiError(0, 'network');
      },
    });
    const { user, onDeleted } = setup(api);
    await askToDelete(user);
    await user.type(screen.getByLabelText(/Type DELETE/), 'DELETE');
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirmAction }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(t.settings.deleteFailed),
    );
    expect(onDeleted).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('says the data is already gone when only the account survived', async () => {
    // The half-done case. Telling the user nothing was removed would be a lie.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api: VireApi = Object.assign(new MemoryVireApi(PROFILE), {
      deleteAccount: async () => {
        throw new ApiError(500, 'account_not_closed');
      },
    });
    const { user } = setup(api);
    await askToDelete(user);
    await user.type(screen.getByLabelText(/Type DELETE/), 'DELETE');
    await user.click(screen.getByRole('button', { name: t.settings.deleteConfirmAction }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(t.settings.deletePartial),
    );
    vi.restoreAllMocks();
  });
});
