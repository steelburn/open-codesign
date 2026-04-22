import { describe, expect, it, vi } from 'vitest';
import type { CodexOAuthStatus } from '../../../preload/index';
import { performLogin, performLogout, resolveViewState } from './ChatgptLoginCard';

function statusLoggedIn(overrides: Partial<CodexOAuthStatus> = {}): CodexOAuthStatus {
  return {
    loggedIn: true,
    email: 'user@example.com',
    accountId: 'acct_123',
    expiresAt: Date.now() + 3600_000,
    ...overrides,
  };
}

function statusLoggedOut(): CodexOAuthStatus {
  return { loggedIn: false, email: null, accountId: null, expiresAt: null };
}

describe('resolveViewState', () => {
  it('returns not-logged-in when codesign bridge missing (status null)', () => {
    // Matches "window.codesign undefined" — the component leaves status as null
    // and renders the login button.
    expect(resolveViewState(null, false)).toBe('not-logged-in');
  });

  it('returns not-logged-in when status has loggedIn=false', () => {
    expect(resolveViewState(statusLoggedOut(), false)).toBe('not-logged-in');
  });

  it('returns logged-in when status has loggedIn=true', () => {
    expect(resolveViewState(statusLoggedIn(), false)).toBe('logged-in');
  });

  it('returns loading while a login request is in-flight, even with logged-in status', () => {
    // Loading takes precedence so the "opening browser" affordance always wins.
    expect(resolveViewState(statusLoggedIn(), true)).toBe('loading');
    expect(resolveViewState(null, true)).toBe('loading');
  });
});

describe('performLogin', () => {
  it('sets loading true then false, updates status, and notifies the parent on success', async () => {
    const next = statusLoggedIn({ email: 'a@b.com' });
    const api = {
      status: vi.fn(),
      login: vi.fn().mockResolvedValue(next),
      logout: vi.fn(),
    };
    const setStatus = vi.fn();
    const setLoading = vi.fn();
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    const pushToast = vi.fn();

    await performLogin({ api, setStatus, setLoading, pushToast, onStatusChange });

    expect(api.login).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith(next);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(pushToast).not.toHaveBeenCalled();
    expect(setLoading).toHaveBeenNthCalledWith(1, true);
    expect(setLoading).toHaveBeenNthCalledWith(2, false);
  });

  it('resets loading and surfaces a toast when login rejects', async () => {
    const api = {
      status: vi.fn(),
      login: vi.fn().mockRejectedValue(new Error('network down')),
      logout: vi.fn(),
    };
    const setStatus = vi.fn();
    const setLoading = vi.fn();
    const pushToast = vi.fn();

    await performLogin({ api, setStatus, setLoading, pushToast });

    expect(setStatus).not.toHaveBeenCalled();
    expect(setLoading).toHaveBeenNthCalledWith(2, false);
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'error', description: 'network down' }),
    );
  });
});

describe('performLogout', () => {
  it('bails without calling the IPC when the confirm dialog is dismissed', async () => {
    const api = {
      status: vi.fn(),
      login: vi.fn(),
      logout: vi.fn().mockResolvedValue(statusLoggedOut()),
    };
    const setStatus = vi.fn();
    const pushToast = vi.fn();
    const confirm = vi.fn().mockReturnValue(false);

    const result = await performLogout({ api, setStatus, pushToast, confirm });

    expect(result).toBe(false);
    expect(api.logout).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('calls logout and updates status when the user confirms', async () => {
    const next = statusLoggedOut();
    const api = {
      status: vi.fn(),
      login: vi.fn(),
      logout: vi.fn().mockResolvedValue(next),
    };
    const setStatus = vi.fn();
    const pushToast = vi.fn();
    const confirm = vi.fn().mockReturnValue(true);
    const onStatusChange = vi.fn();

    const result = await performLogout({
      api,
      setStatus,
      pushToast,
      confirm,
      onStatusChange,
    });

    expect(result).toBe(true);
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith(next);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(pushToast).not.toHaveBeenCalled();
  });

  it('surfaces a toast when logout rejects', async () => {
    const api = {
      status: vi.fn(),
      login: vi.fn(),
      logout: vi.fn().mockRejectedValue(new Error('revoke failed')),
    };
    const setStatus = vi.fn();
    const pushToast = vi.fn();
    const confirm = vi.fn().mockReturnValue(true);

    const result = await performLogout({ api, setStatus, pushToast, confirm });

    expect(result).toBe(false);
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'error', description: 'revoke failed' }),
    );
  });
});
