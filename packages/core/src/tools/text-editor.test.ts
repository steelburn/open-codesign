import { describe, expect, it } from 'vitest';
import { makeTextEditorTool, type TextEditorFsCallbacks } from './text-editor.js';

function makeFs(content: string, extraFiles: Record<string, string> = {}): TextEditorFsCallbacks {
  const files = new Map<string, string>([['App.jsx', content], ...Object.entries(extraFiles)]);
  return {
    view: (path) => {
      const file = files.get(path);
      return file === undefined ? null : { content: file, numLines: file.split('\n').length };
    },
    create: (path, fileText) => {
      files.set(path, fileText);
      return { path };
    },
    strReplace: (path, oldStr, newStr) => {
      const current = files.get(path);
      if (current === undefined) throw new Error(`missing ${path}`);
      files.set(path, current.replace(oldStr, newStr));
      return { path };
    },
    insert: (path, line, text) => {
      const current = files.get(path);
      if (current === undefined) throw new Error(`missing ${path}`);
      const lines = current.split('\n');
      lines.splice(line, 0, text);
      files.set(path, lines.join('\n'));
      return { path };
    },
    listDir: (dir) => {
      if (dir !== '.') return [];
      return Array.from(files.keys()).sort();
    },
  };
}

describe('str_replace_based_edit_tool', () => {
  it('treats -1 range bounds as EOF instead of a full-file range', async () => {
    const tool = makeTextEditorTool(makeFs(['one', 'two', 'three'].join('\n')));

    const result = await tool.execute('call-1', {
      command: 'view',
      path: 'App.jsx',
      view_range: [-1, -1],
    });

    const first = result.content[0];
    expect(first?.type).toBe('text');
    const text = first?.type === 'text' ? first.text : '';
    expect(text).toContain('App.jsx · lines 3-3 of 3');
    expect(text).toContain('three');
    expect(text).not.toContain('one');
    expect(text).not.toContain('two');
  });

  it('rejects command-specific missing fields instead of silently defaulting them', async () => {
    const tool = makeTextEditorTool(makeFs('one'));

    await expect(
      tool.execute('call-1', {
        command: 'create',
        path: 'new.html',
      }),
    ).rejects.toThrow(/create requires file_text/);

    await expect(
      tool.execute('call-2', {
        command: 'str_replace',
        path: 'App.jsx',
        old_str: 'one',
      }),
    ).rejects.toThrow(/str_replace requires new_str/);

    await expect(
      tool.execute('call-3', {
        command: 'insert',
        path: 'App.jsx',
        new_str: 'two',
      }),
    ).rejects.toThrow(/insert requires numeric insert_line/);
  });

  it('returns a recoverable error when editing an existing file before viewing it', async () => {
    const tool = makeTextEditorTool(makeFs('one'));

    const result = await tool.execute('call-1', {
      command: 'str_replace',
      path: 'App.jsx',
      old_str: 'one',
      new_str: 'two',
    });

    const first = result.content[0];
    expect(first?.type).toBe('text');
    expect(first?.type === 'text' ? first.text : '').toContain(
      'View App.jsx before editing it in this run',
    );
  });

  it('allows str_replace after viewing the file', async () => {
    const tool = makeTextEditorTool(makeFs('one'));

    await tool.execute('call-1', { command: 'view', path: 'App.jsx' });
    const result = await tool.execute('call-2', {
      command: 'str_replace',
      path: 'App.jsx',
      old_str: 'one',
      new_str: 'two',
    });

    expect(result.details).toMatchObject({ command: 'str_replace', path: 'App.jsx' });
  });

  it('allows insert after a range view of the file', async () => {
    const tool = makeTextEditorTool(makeFs(['one', 'two'].join('\n')));

    await tool.execute('call-1', { command: 'view', path: 'App.jsx', view_range: [1, 1] });
    const result = await tool.execute('call-2', {
      command: 'insert',
      path: 'App.jsx',
      insert_line: 1,
      new_str: 'inserted',
    });

    expect(result.details).toMatchObject({ command: 'insert', path: 'App.jsx' });
  });

  it('allows mutating a file created in the same run without a separate view', async () => {
    const tool = makeTextEditorTool(makeFs('one'));

    await tool.execute('call-1', { command: 'create', path: 'new.jsx', file_text: 'alpha' });
    const result = await tool.execute('call-2', {
      command: 'str_replace',
      path: 'new.jsx',
      old_str: 'alpha',
      new_str: 'beta',
    });

    expect(result.details).toMatchObject({ command: 'str_replace', path: 'new.jsx' });
  });

  it('does not treat a directory view as viewing a concrete file', async () => {
    const tool = makeTextEditorTool(makeFs('one'));

    await tool.execute('call-1', { command: 'view', path: '.' });
    const result = await tool.execute('call-2', {
      command: 'insert',
      path: 'App.jsx',
      insert_line: 1,
      new_str: 'inserted',
    });

    const first = result.content[0];
    expect(first?.type).toBe('text');
    expect(first?.type === 'text' ? first.text : '').toContain(
      'View App.jsx before editing it in this run',
    );
  });
});
