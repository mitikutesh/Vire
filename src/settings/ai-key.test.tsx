import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryVireApi } from '@/api/memory-api';
import { TEST_AI_KEY } from '@/api/test-ai-key';
import { ApiError, type VireApi } from '@/api/types';
import { createQueryClient } from '@/data/query';
import { t } from '@/content/strings';
import { AiKeySection } from './AiKeySection';

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345';

function setup(api: VireApi = new MemoryVireApi()) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<AiKeySection api={api} />, { wrapper });
  return { api, user: userEvent.setup() };
}

describe('with no key yet', () => {
  it('says so, and explains what still works without one', async () => {
    setup();
    expect(await screen.findByText(t.settings.aiKeyUnset)).toBeInTheDocument();
    expect(screen.getByText(t.settings.aiKeyBlurb)).toBeInTheDocument();
  });

  it('will not submit an empty field', () => {
    setup();
    expect(screen.getByRole('button', { name: t.settings.aiKeySave })).toBeDisabled();
  });

  it('offers no way to remove a key that does not exist', () => {
    setup();
    expect(screen.queryByRole('button', { name: t.settings.aiKeyClear })).not.toBeInTheDocument();
  });
});

describe('saving a key', () => {
  it('stores it and reports which provider it is for', async () => {
    const { user, api } = setup();
    await user.type(screen.getByLabelText(t.settings.aiKeyLabel), KEY);
    await user.click(screen.getByRole('button', { name: t.settings.aiKeySave }));

    await waitFor(() =>
      expect(screen.getByText(t.settings.aiKeySet(t.settings.aiKeyAnthropic))).toBeInTheDocument(),
    );
    expect(await api.getAiKeyStatus()).toEqual({ set: true, provider: 'anthropic' });
  });

  it('honours the chosen provider', async () => {
    const { user, api } = setup();
    await user.selectOptions(screen.getByLabelText(t.settings.aiKeyProvider), 'openai');
    await user.type(screen.getByLabelText(t.settings.aiKeyLabel), KEY);
    await user.click(screen.getByRole('button', { name: t.settings.aiKeySave }));

    await waitFor(async () => expect((await api.getAiKeyStatus()).provider).toBe('openai'));
  });

  it('clears the field on success, so the key is not left on screen', async () => {
    const { user } = setup();
    const field = screen.getByLabelText(t.settings.aiKeyLabel);
    await user.type(field, KEY);
    await user.click(screen.getByRole('button', { name: t.settings.aiKeySave }));

    await waitFor(() => expect(field).toHaveValue(''));
  });

  it('keeps a rejected key in the field, so a typo can be corrected', async () => {
    // Retyping a 50-character key from its source because of one wrong character
    // is the kind of thing that makes people paste it somewhere less safe.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api: VireApi = Object.assign(new MemoryVireApi(), {
      setAiKey: async () => {
        throw new ApiError(422, 'invalid_ai_key');
      },
    });
    const { user } = setup(api);

    const field = screen.getByLabelText(t.settings.aiKeyLabel);
    await user.type(field, KEY);
    await user.click(screen.getByRole('button', { name: t.settings.aiKeySave }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(t.settings.aiKeyFailed),
    );
    expect(field).toHaveValue(KEY);
    vi.restoreAllMocks();
  });
});

describe('never showing it back', () => {
  it('offers no field containing the stored key', async () => {
    // The invariant: a session can replace the key but never read it. There is
    // deliberately no reveal button, and the copy says so.
    const { user: _user } = setup(new MemoryVireApi(null, { aiKey: TEST_AI_KEY }));

    await waitFor(() =>
      expect(screen.getByText(t.settings.aiKeySet(t.settings.aiKeyAnthropic))).toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain(TEST_AI_KEY.key);
    // The entry field is empty, not prefilled with the stored value.
    expect(screen.getByLabelText(t.settings.aiKeyLabel)).toHaveValue('');
    expect(screen.getByText(t.settings.aiKeyWriteOnly)).toBeInTheDocument();
  });

  it('masks what is being typed', () => {
    // A shoulder-surfable API key in a plain text box is a poor default.
    setup();
    expect(screen.getByLabelText(t.settings.aiKeyLabel)).toHaveAttribute('type', 'password');
  });

  it('keeps password managers out of it', () => {
    // A manager offering to save this next to website logins is not what anyone
    // wants for a billable API credential.
    setup();
    expect(screen.getByLabelText(t.settings.aiKeyLabel)).toHaveAttribute('autocomplete', 'off');
  });
});

describe('removing it', () => {
  it('clears the key and returns to the unset state', async () => {
    const { user, api } = setup(new MemoryVireApi(null, { aiKey: TEST_AI_KEY }));
    await user.click(await screen.findByRole('button', { name: t.settings.aiKeyClear }));

    await waitFor(() => expect(screen.getByText(t.settings.aiKeyUnset)).toBeInTheDocument());
    expect(await api.getAiKeyStatus()).toEqual({ set: false, provider: null });
  });

  it('offers to replace rather than save once one is stored', async () => {
    setup(new MemoryVireApi(null, { aiKey: TEST_AI_KEY }));
    expect(
      await screen.findByRole('button', { name: t.settings.aiKeyReplace }),
    ).toBeInTheDocument();
  });
});
