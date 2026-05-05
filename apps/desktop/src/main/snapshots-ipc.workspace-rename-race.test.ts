import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Design } from '@open-codesign/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesign, initInMemoryDb, updateDesignWorkspace } from './snapshots-db';
import { registerSnapshotsIpc, registerWorkspaceIpc } from './snapshots-ipc';
import { withStableWorkspacePath } from './workspace-path-lock';
import type { WorkspaceFileEntry } from './workspace-reader';

type Handler = (event: unknown, raw: unknown) => unknown;

const handlers = vi.hoisted(() => new Map<string, Handler>());
const renameControl = vi.hoisted(() => {
  let markStarted: (() => void) | null = null;
  let release: (() => void) | null = null;
  let started: Promise<void> | null = null;
  let unblock: Promise<void> | null = null;
  return {
    get started(): Promise<void> {
      if (started === null) {
        started = new Promise((resolve) => {
          markStarted = resolve;
        });
      }
      return started;
    },
    reset(): void {
      started = new Promise((resolve) => {
        markStarted = resolve;
      });
      unblock = new Promise((resolve) => {
        release = resolve;
      });
    },
    markStarted(): void {
      markStarted?.();
    },
    release(): void {
      release?.();
    },
    async waitUntilReleased(): Promise<void> {
      await unblock;
    },
  };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: vi.fn(async (oldPath: string, newPath: string) => {
      await actual.rename(oldPath, newPath);
      renameControl.markStarted();
      await renameControl.waitUntilReleased();
    }),
  };
});

vi.mock('./electron-runtime', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/open-codesign-tests'),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers.set(channel, handler);
    }),
  },
}));

vi.mock('./logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function getHandler(channel: string): Handler {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
  return handler;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

describe('workspace files IPC during auto-managed workspace renames', () => {
  const documentsRoot = '/tmp/open-codesign-tests';
  const defaultWorkspaceRoot = path.join(documentsRoot, 'CoDesign');
  let root: string;

  beforeEach(async () => {
    handlers.clear();
    renameControl.reset();
    await rm(documentsRoot, { recursive: true, force: true });
    await mkdir(defaultWorkspaceRoot, { recursive: true });
    root = defaultWorkspaceRoot;
  });

  afterEach(async () => {
    renameControl.release();
    await rm(documentsRoot, { recursive: true, force: true });
  });

  it('waits for an in-flight workspace rename before listing files', async () => {
    const db = initInMemoryDb();
    const design = createDesign(db, 'Untitled design 1');
    const oldWorkspace = path.join(root, 'Untitled-design-1');
    await mkdir(oldWorkspace);
    await writeFile(path.join(oldWorkspace, 'App.jsx'), 'function App() { return null; }', 'utf8');
    updateDesignWorkspace(db, design.id, oldWorkspace);
    registerSnapshotsIpc(db);
    registerWorkspaceIpc(db, () => null);

    const renameDesign = getHandler('snapshots:v1:rename-design');
    const listFiles = getHandler('codesign:files:v1:list');

    const renamePromise = renameDesign(null, {
      schemaVersion: 1,
      id: design.id,
      name: 'General Agent Benchmark Deck',
    }) as Promise<Design>;
    await renameControl.started;
    await expect(exists(oldWorkspace)).resolves.toBe(false);

    let listSettled = false;
    const listPromise = Promise.resolve(
      listFiles(null, { schemaVersion: 1, designId: design.id }) as Promise<WorkspaceFileEntry[]>,
    ).finally(() => {
      listSettled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listSettled).toBe(false);

    renameControl.release();
    const [updated, files] = await Promise.all([renamePromise, listPromise]);

    expect(updated.workspacePath).toBe(path.join(root, 'General-Agent-Benchmark-Deck'));
    expect(files.map((file) => file.path)).toContain('App.jsx');
  });

  it('defers auto-managed workspace folder renames while generation owns a stable workspace path', async () => {
    const db = initInMemoryDb();
    const design = createDesign(db, 'Untitled design 1');
    const oldWorkspace = path.join(root, 'Untitled-design-1');
    const newWorkspace = path.join(root, 'Pocketbase-Studio-Open-Source-Home');
    await mkdir(oldWorkspace);
    await writeFile(path.join(oldWorkspace, 'App.jsx'), 'function App() { return null; }', 'utf8');
    updateDesignWorkspace(db, design.id, oldWorkspace);
    registerSnapshotsIpc(db);
    registerWorkspaceIpc(db, () => null);

    const renameDesign = getHandler('snapshots:v1:rename-design');

    let releaseGeneration = (): void => {};
    const generationReleased = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    const generationLease = withStableWorkspacePath(design.id, async () => {
      await generationReleased;
    });

    let renameSettled = false;
    const renamePromise = Promise.resolve(
      renameDesign(null, {
        schemaVersion: 1,
        id: design.id,
        name: 'Pocketbase Studio Open Source Home',
      }) as Promise<Design>,
    ).finally(() => {
      renameSettled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(renameSettled).toBe(false);
    await expect(exists(oldWorkspace)).resolves.toBe(true);
    await expect(exists(newWorkspace)).resolves.toBe(false);

    releaseGeneration();
    renameControl.release();
    const updated = await renamePromise;
    await generationLease;

    expect(updated.workspacePath).toBe(newWorkspace);
    await expect(exists(oldWorkspace)).resolves.toBe(false);
    await expect(exists(path.join(newWorkspace, 'App.jsx'))).resolves.toBe(true);
  });
});
