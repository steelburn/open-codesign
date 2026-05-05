import { describe, expect, it, vi } from 'vitest';

vi.mock('../electron-runtime', () => ({
  app: { getPath: vi.fn(() => '/tmp/open-codesign-test') },
  ipcMain: { handle: vi.fn() },
}));

import { contextWindowForContextPack } from './generate';

describe('generate IPC context budget helpers', () => {
  it('uses active model contextWindow when the model object exposes it', () => {
    expect(
      contextWindowForContextPack({ provider: 'p', modelId: 'm', contextWindow: 64_000 }),
    ).toBe(64_000);
  });

  it('falls back to the harness default when model metadata lacks contextWindow', () => {
    expect(contextWindowForContextPack({ provider: 'p', modelId: 'm' })).toBe(200_000);
  });
});
