import { describe, expect, it, vi } from 'vitest';

vi.mock('../electron-runtime', () => ({
  app: { getPath: vi.fn(() => '/tmp/open-codesign-test') },
  ipcMain: { handle: vi.fn() },
}));

import {
  assistantNoteForToolStart,
  buildRunPreferenceAskInput,
  contextWindowForContextPack,
  dropCurrentPromptEchoFromChatRows,
  shouldRunUserMemoryCandidateCapture,
} from './generate';

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

describe('generate IPC memory preference helpers', () => {
  it('captures user memory candidates only when the memory system and user auto-update are enabled', () => {
    expect(
      shouldRunUserMemoryCandidateCapture({
        memoryEnabled: true,
        userMemoryAutoUpdate: true,
      }),
    ).toBe(true);
    expect(
      shouldRunUserMemoryCandidateCapture({
        memoryEnabled: true,
        userMemoryAutoUpdate: false,
      }),
    ).toBe(false);
    expect(
      shouldRunUserMemoryCandidateCapture({
        memoryEnabled: false,
        userMemoryAutoUpdate: true,
      }),
    ).toBe(false);
  });
});

describe('generate IPC run preference preflight helpers', () => {
  it('builds clarification input from semantic router questions', () => {
    const input = buildRunPreferenceAskInput([
      {
        id: 'bitmapAssets',
        type: 'text-options',
        prompt: 'Generate bitmap assets?',
        options: ['auto', 'no', 'yes'],
      },
    ]);
    expect(input.questions[0]).toMatchObject({
      id: 'bitmapAssets',
      type: 'text-options',
      options: ['auto', 'no', 'yes'],
    });
  });

  it('drops the optimistic current user row before main-process planning', () => {
    const rows = [
      {
        schemaVersion: 1,
        id: 0,
        designId: 'design-1',
        seq: 0,
        kind: 'user',
        payload: { text: 'make something cool' },
        snapshotId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ] as const;

    expect(dropCurrentPromptEchoFromChatRows([...rows], 'make something cool')).toEqual([]);
  });

  it('keeps real prior turns even when the prompt text differs', () => {
    const rows = [
      {
        schemaVersion: 1,
        id: 0,
        designId: 'design-1',
        seq: 0,
        kind: 'user',
        payload: { text: 'make something cool' },
        snapshotId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ] as const;

    expect(dropCurrentPromptEchoFromChatRows([...rows], 'make it brighter')).toHaveLength(1);
  });
});

describe('generate IPC assistant phase notes', () => {
  it('emits fixed notes for major tool phases when the model has not streamed text', () => {
    expect(assistantNoteForToolStart('ask', {}, false)).toBe(
      'I need a couple choices before building.',
    );
    expect(assistantNoteForToolStart('set_todos', {}, false)).toBe(
      'I’ll lay out the build steps first.',
    );
    expect(
      assistantNoteForToolStart('str_replace_based_edit_tool', { command: 'create' }, false),
    ).toBe('I’m writing the first complete pass now.');
    expect(
      assistantNoteForToolStart('str_replace_based_edit_tool', { command: 'str_replace' }, false),
    ).toBe('I’m applying the next focused edit.');
    expect(assistantNoteForToolStart('preview', {}, false)).toBe(
      'I’m previewing the artifact and checking for issues.',
    );
    expect(assistantNoteForToolStart('done', {}, false)).toBe(
      'I’m running the final completion check.',
    );
  });

  it('does not emit host notes after model text has streamed', () => {
    expect(assistantNoteForToolStart('preview', {}, true)).toBeNull();
  });
});
