import { describe, expect, it } from 'vitest';
import {
  assertFinalizationGate,
  cloneResourceState,
  recordDone,
  recordMutation,
} from './resource-state.js';
import type { TextEditorFsCallbacks } from './tools/text-editor.js';

function makeFs(initial: Record<string, string> = {}): TextEditorFsCallbacks {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    view(path) {
      const c = map.get(path);
      return c === undefined ? null : { content: c, numLines: c.split('\n').length };
    },
    create(path, content) {
      map.set(path, content);
      return { path };
    },
    strReplace(path, oldStr, newStr) {
      const cur = map.get(path);
      if (cur === undefined) throw new Error('not found');
      map.set(path, cur.replace(oldStr, newStr));
      return { path };
    },
    insert(path) {
      return { path };
    },
    listDir(dir = '.') {
      const prefix = dir === '.' || dir.length === 0 ? '' : `${dir.replace(/\/$/, '')}/`;
      return [...map.keys()].filter((path) => path.startsWith(prefix)).sort();
    },
  };
}

describe('resource finalization gate', () => {
  it('accepts a non-renderable done target for document-first work', () => {
    const state = cloneResourceState(undefined);
    recordMutation(state);
    recordDone(state, { status: 'ok', path: 'design-brief.md', errorCount: 0 });

    expect(
      assertFinalizationGate({
        state,
        fs: makeFs({ 'design-brief.md': '# Design brief\n\nA handoff document.' }),
        enforce: true,
      }),
    ).toEqual([]);
  });
});
