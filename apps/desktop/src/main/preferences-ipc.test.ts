import { CodesignError } from '@open-codesign/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron and logger before importing the module under test.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('electron-log/main', () => ({
  default: {
    scope: () => ({
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    }),
    transports: {
      file: { resolvePathFn: null, maxSize: 0, format: '' },
      console: { level: 'info', format: '' },
    },
    errorHandler: { startCatching: vi.fn() },
    eventLogger: { startLogging: vi.fn() },
    info: vi.fn(),
  },
}));

const readFileMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
  writeFile: vi.fn(async () => {}),
  mkdir: vi.fn(async () => {}),
}));

import { writeFile } from 'node:fs/promises';
import { readPersisted, registerPreferencesIpc } from './preferences-ipc';

describe('readPersisted()', () => {
  it('returns defaults when the file does not exist (ENOENT)', async () => {
    const notFound = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    readFileMock.mockRejectedValueOnce(notFound);

    const result = await readPersisted();
    expect(result).toEqual({
      updateChannel: 'stable',
      generationTimeoutSec: 1200,
      checkForUpdatesOnStartup: true,
      dismissedUpdateVersion: '',
    });
  });

  it('honors XDG_CONFIG_HOME when computing the persisted file path', async () => {
    const prev = process.env['XDG_CONFIG_HOME'];
    process.env['XDG_CONFIG_HOME'] = '/tmp/xdg-test-home';
    const notFound = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    readFileMock.mockRejectedValueOnce(notFound);
    try {
      await readPersisted();
      expect(readFileMock).toHaveBeenLastCalledWith(
        '/tmp/xdg-test-home/open-codesign/preferences.json',
        'utf8',
      );
    } finally {
      if (prev === undefined) process.env['XDG_CONFIG_HOME'] = undefined;
      else process.env['XDG_CONFIG_HOME'] = prev;
    }
  });

  it('throws CodesignError with PREFERENCES_READ_FAILED on a non-ENOENT error (e.g. EACCES)', async () => {
    const permissionDenied = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    readFileMock.mockRejectedValueOnce(permissionDenied);

    await expect(readPersisted()).rejects.toBeInstanceOf(CodesignError);

    readFileMock.mockRejectedValueOnce(permissionDenied);
    const err = await readPersisted().catch((e: unknown) => e);
    expect((err as CodesignError).code).toBe('PREFERENCES_READ_FAILED');
  });

  it('migrates schemaVersion 1 with legacy 120s timeout to the 1200s default', async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ schemaVersion: 1, updateChannel: 'stable', generationTimeoutSec: 120 }),
    );
    const result = await readPersisted();
    expect(result.generationTimeoutSec).toBe(1200);
  });

  it('preserves user-chosen non-legacy timeout across the v1 → v2 migration', async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ schemaVersion: 1, updateChannel: 'stable', generationTimeoutSec: 300 }),
    );
    const result = await readPersisted();
    expect(result.generationTimeoutSec).toBe(300);
  });

  it('migrates schemaVersion 2 with the old 600s default to 1200s', async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ schemaVersion: 2, updateChannel: 'stable', generationTimeoutSec: 600 }),
    );
    const result = await readPersisted();
    expect(result.generationTimeoutSec).toBe(1200);
  });

  it('respects an explicit 600s when schema is already v3 (user chose it post-migration)', async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ schemaVersion: 3, updateChannel: 'stable', generationTimeoutSec: 600 }),
    );
    const result = await readPersisted();
    expect(result.generationTimeoutSec).toBe(600);
  });
});

describe('preferences v4 schema fields', () => {
  // Capture ipcMain.handle calls so we can invoke registered handlers directly.
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  const handlers: Record<string, (...args: any[]) => unknown> = {};

  beforeEach(async () => {
    const { ipcMain } = await import('electron');
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });
    // Re-register so the new mockImplementation captures the handlers.
    registerPreferencesIpc();
  });

  it('reads checkForUpdatesOnStartup and dismissedUpdateVersion with v4 defaults when absent', async () => {
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({ schemaVersion: 3, updateChannel: 'stable', generationTimeoutSec: 1200 }),
    );
    const prefs = await readPersisted();
    expect(prefs.checkForUpdatesOnStartup).toBe(true);
    expect(prefs.dismissedUpdateVersion).toBe('');
  });

  it('round-trips dismissedUpdateVersion through preferences:v1:update', async () => {
    // First read (in the update handler) returns the current stored preferences.
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        schemaVersion: 4,
        updateChannel: 'stable',
        generationTimeoutSec: 1200,
        checkForUpdatesOnStartup: true,
        dismissedUpdateVersion: '',
      }),
    );
    const updated = await (
      handlers['preferences:v1:update'] as (_e: null, raw: unknown) => Promise<unknown>
    )(null, { dismissedUpdateVersion: '0.2.1' });
    expect((updated as { dismissedUpdateVersion: string }).dismissedUpdateVersion).toBe('0.2.1');

    // Verify writeFile was called with the updated value.
    const writeFileMock = vi.mocked(writeFile);
    const lastCall = writeFileMock.mock.calls.at(-1);
    if (!lastCall) throw new Error('writeFile was not called');
    const written = JSON.parse(lastCall[1] as string) as { dismissedUpdateVersion: string };
    expect(written.dismissedUpdateVersion).toBe('0.2.1');
  });
});
