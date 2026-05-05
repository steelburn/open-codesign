/**
 * str_replace_based_edit_tool wired to the workspace-backed virtual FS.
 *
 * Mirrors Anthropic's native `str_replace_based_edit_tool` shape so Claude
 * models recognize it without extra schema training. Other models that
 * support the OpenAI tool-call format see it as a regular custom tool.
 *
 * Tool implementation lives in `apps/desktop/src/main` (this file imports
 * the virtual-FS callbacks indirectly via dependency injection — the core
 * package must NOT depend on apps/desktop).
 */

import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { DEFAULT_SOURCE_ENTRY } from '@open-codesign/shared';
import { Type } from '@sinclair/typebox';

export interface TextEditorFsCallbacks {
  view(path: string): { content: string; numLines: number } | null;
  create(path: string, content: string): Promise<{ path: string }> | { path: string };
  strReplace(
    path: string,
    oldStr: string,
    newStr: string,
  ): Promise<{ path: string }> | { path: string };
  insert(path: string, line: number, text: string): Promise<{ path: string }> | { path: string };
  /** Optional: list files for `view` on a directory. Returns sorted paths. */
  listDir(dir: string): string[];
}

const TextEditorParams = Type.Object({
  command: Type.Union([
    Type.Literal('view'),
    Type.Literal('create'),
    Type.Literal('str_replace'),
    Type.Literal('insert'),
  ]),
  path: Type.String(),
  file_text: Type.Optional(Type.String()),
  old_str: Type.Optional(Type.String()),
  new_str: Type.Optional(Type.String()),
  insert_line: Type.Optional(Type.Number()),
  /** Optional `[startLine, endLine]` (1-indexed, inclusive) to narrow a view
   *  to a specific range instead of dumping the whole file. Either bound may
   *  be -1 to mean "end of file". Only valid with `command: 'view'`. Declared
   *  as a fixed-length number array (min/max = 2) because `Type.Tuple` emits
   *  legacy `items: [...]` which Anthropic's draft 2020-12 validator rejects. */
  view_range: Type.Optional(Type.Array(Type.Number(), { minItems: 2, maxItems: 2 })),
});

const INITIAL_SOURCE_CREATE_MAX_CHARS = 12000;
const INITIAL_SOURCE_CREATE_MAX_LINES = 220;

export interface TextEditorDetails {
  command: 'view' | 'create' | 'str_replace' | 'insert';
  path: string;
  result?: unknown;
}

function ok(text: string, details: TextEditorDetails): AgentToolResult<TextEditorDetails> {
  return {
    content: [{ type: 'text', text }],
    details,
  };
}

function recoverableViewRequired(
  path: string,
  command: 'str_replace' | 'insert',
): AgentToolResult<TextEditorDetails> {
  return ok(
    `View ${path} before editing it in this run, then retry ${command}. This protects against editing stale workspace state.`,
    { command, path, result: { requiresView: true } },
  );
}

function exactEditFailuresExceeded(
  path: string,
  count: number,
): AgentToolResult<TextEditorDetails> {
  return ok(exactEditFailuresExceededText(path, count), {
    command: 'str_replace',
    path,
    result: { blocked: true, reason: 'too_many_failed_edits' },
  });
}

function exactEditFailuresExceededText(path: string, count: number): string {
  return `Too many failed exact edits for ${path} (${count}). Stop using str_replace/insert on this file in this run. Re-read the relevant range and use create to rewrite the complete corrected file, or ask the user to continue.`;
}

function initialCreateIsTooLarge(path: string, text: string): boolean {
  if (path !== DEFAULT_SOURCE_ENTRY) return false;
  if (text.length > INITIAL_SOURCE_CREATE_MAX_CHARS) return true;
  return text.split('\n').length > INITIAL_SOURCE_CREATE_MAX_LINES;
}

function initialCreateTooLarge(path: string, text: string): AgentToolResult<TextEditorDetails> {
  const lines = text.split('\n').length;
  return ok(
    `Blocked create ${path}: the first workspace write is too large (${text.length} chars, ${lines} lines). Create a compact file scaffold first, then add sections with smaller str_replace/insert edits before calling preview. No file was written.`,
    {
      command: 'create',
      path,
      result: {
        blocked: true,
        reason: 'initial_create_too_large',
        chars: text.length,
        lines,
        maxChars: INITIAL_SOURCE_CREATE_MAX_CHARS,
        maxLines: INITIAL_SOURCE_CREATE_MAX_LINES,
      },
    },
  );
}

function requireString(
  value: unknown,
  field: string,
  command: TextEditorDetails['command'],
): string {
  if (typeof value !== 'string') {
    throw new Error(`${command} requires ${field}`);
  }
  return value;
}

function requireNumber(
  value: unknown,
  field: string,
  command: TextEditorDetails['command'],
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${command} requires numeric ${field}`);
  }
  return value;
}

export function makeTextEditorTool(
  fs: TextEditorFsCallbacks,
): AgentTool<typeof TextEditorParams, TextEditorDetails> {
  // Per-run view budget: the full content of a file is returned on the FIRST
  // view of each path; subsequent views collapse to a short summary (line
  // count + head snippet + explicit reminder). Rationale: view accumulates in
  // the agent's context window — re-viewing a 2000-line App.jsx four times
  // has blown the 1M-token limit in production. AGENTIC_TOOL_GUIDANCE already
  // asks the agent to "view once, then work from memory"; this enforces it.
  const viewCountByPath = new Map<string, number>();
  const viewedFilePaths = new Set<string>();
  const changedThisRunPaths = new Set<string>();
  const failedExactEditCountByPath = new Map<string, number>();
  const FAILED_EXACT_EDIT_LIMIT = 3;

  function mutationRequiresView(path: string): boolean {
    if (viewedFilePaths.has(path) || changedThisRunPaths.has(path)) return false;
    return fs.view(path) !== null;
  }

  return {
    name: 'str_replace_based_edit_tool',
    label: 'Text editor',
    description:
      'Read and edit files in the current design via view/create/str_replace/insert commands. ' +
      `Paths are relative to the design root (e.g. "${DEFAULT_SOURCE_ENTRY}", "_starters/ios-frame.jsx"). ` +
      'Use create for new files; str_replace requires an exact match of old_str; ' +
      `the first ${DEFAULT_SOURCE_ENTRY} create must be a compact scaffold, not the complete finished page; ` +
      'view returns file content or directory listing. ' +
      'IMPORTANT: pass `view_range: [startLine, endLine]` (1-indexed, inclusive; either bound may be -1 for EOF) ' +
      'to read only a slice of the file — strongly preferred over full-file views after the file has grown past ~100 lines. ' +
      'Without view_range, repeated `view` of the same path within a single run returns only a short summary to protect context.',
    parameters: TextEditorParams,
    async execute(_toolCallId, params): Promise<AgentToolResult<TextEditorDetails>> {
      const path = params.path;
      switch (params.command) {
        case 'view': {
          const file = fs.view(path);
          if (file !== null) {
            // Range view — narrow, always fresh, never capped. Agent should
            // prefer this after the first orientation read.
            if (params.view_range) {
              const [rawStart, rawEnd] = params.view_range;
              if (
                typeof rawStart !== 'number' ||
                typeof rawEnd !== 'number' ||
                !Number.isFinite(rawStart) ||
                !Number.isFinite(rawEnd)
              ) {
                throw new Error('view_range must be [startLine, endLine] as two finite numbers');
              }
              const lines = file.content.split('\n');
              const eof = lines.length;
              const normalizeBound = (value: number): number =>
                value === -1 ? eof : Math.max(1, Math.floor(value));
              const start = Math.min(normalizeBound(rawStart), eof);
              const end = rawEnd === -1 ? eof : Math.max(start, normalizeBound(rawEnd));
              const clampedEnd = Math.min(end, lines.length);
              const slice = lines
                .slice(start - 1, clampedEnd)
                .map((ln, i) => `${String(start + i).padStart(4, ' ')}  ${ln}`)
                .join('\n');
              const header = `${path} · lines ${start}-${clampedEnd} of ${lines.length}\n`;
              viewedFilePaths.add(path);
              return ok(header + slice, {
                command: 'view',
                path,
                result: { numLines: file.numLines, viewRange: [start, clampedEnd] },
              });
            }
            const count = (viewCountByPath.get(path) ?? 0) + 1;
            viewCountByPath.set(path, count);
            if (count === 1) {
              viewedFilePaths.add(path);
              return ok(file.content, {
                command: 'view',
                path,
                result: { numLines: file.numLines },
              });
            }
            // Second+ full-file view: return a tight summary. Agent should
            // switch to view_range for narrow inspections.
            const head = file.content.slice(0, 400);
            const ellipsis = file.content.length > 400 ? '…' : '';
            const summary = `${path} (already viewed ${count - 1} time(s) in this run — ${file.numLines} lines total)\n\nFirst 400 chars for orientation:\n${head}${ellipsis}\n\nTo see a specific region, re-issue view with \`view_range: [startLine, endLine]\` (1-indexed). Full-file re-views are disabled for the rest of this run to keep context from blowing up.`;
            viewedFilePaths.add(path);
            return ok(summary, {
              command: 'view',
              path,
              result: { numLines: file.numLines, summarized: true },
            });
          }
          // Treat as directory if no file matches
          const entries = fs.listDir(path);
          if (entries.length === 0) {
            throw new Error(`Path not found: ${path}`);
          }
          return ok(entries.join('\n'), { command: 'view', path, result: { entries } });
        }
        case 'create': {
          const text = requireString(params.file_text, 'file_text', 'create');
          if (fs.view(path) === null && initialCreateIsTooLarge(path, text)) {
            return initialCreateTooLarge(path, text);
          }
          const result = await fs.create(path, text);
          failedExactEditCountByPath.delete(path);
          changedThisRunPaths.add(path);
          return ok(`Created ${result.path}`, { command: 'create', path, result });
        }
        case 'str_replace': {
          const oldStr = requireString(params.old_str, 'old_str', 'str_replace');
          const newStr = requireString(params.new_str, 'new_str', 'str_replace');
          if (oldStr.length === 0) throw new Error('str_replace requires non-empty old_str');
          if (mutationRequiresView(path)) return recoverableViewRequired(path, 'str_replace');
          const failedCount = failedExactEditCountByPath.get(path) ?? 0;
          if (failedCount >= FAILED_EXACT_EDIT_LIMIT) {
            return exactEditFailuresExceeded(path, failedCount);
          }
          try {
            const result = await fs.strReplace(path, oldStr, newStr);
            failedExactEditCountByPath.delete(path);
            changedThisRunPaths.add(path);
            return ok(`Edited ${result.path}`, { command: 'str_replace', path, result });
          } catch (err) {
            const nextFailedCount = failedCount + 1;
            failedExactEditCountByPath.set(path, nextFailedCount);
            const message = err instanceof Error ? err.message : String(err);
            const prefix =
              nextFailedCount >= FAILED_EXACT_EDIT_LIMIT
                ? `Edit failed: ${message}\n${exactEditFailuresExceededText(path, nextFailedCount)}`
                : `Edit failed: ${message}. Re-read the smallest relevant range, then retry with a more exact old_str.`;
            return ok(prefix, {
              command: 'str_replace',
              path,
              result: { failed: true, failureCount: nextFailedCount, message },
            });
          }
        }
        case 'insert': {
          const line = requireNumber(params.insert_line, 'insert_line', 'insert');
          const text = requireString(params.new_str, 'new_str', 'insert');
          if (mutationRequiresView(path)) return recoverableViewRequired(path, 'insert');
          const failedCount = failedExactEditCountByPath.get(path) ?? 0;
          if (failedCount >= FAILED_EXACT_EDIT_LIMIT) {
            return exactEditFailuresExceeded(path, failedCount);
          }
          try {
            const result = await fs.insert(path, line, text);
            failedExactEditCountByPath.delete(path);
            changedThisRunPaths.add(path);
            return ok(`Inserted at ${result.path}:${line}`, { command: 'insert', path, result });
          } catch (err) {
            const nextFailedCount = failedCount + 1;
            failedExactEditCountByPath.set(path, nextFailedCount);
            const message = err instanceof Error ? err.message : String(err);
            return ok(`Edit failed: ${message}. Re-read the target range before retrying.`, {
              command: 'insert',
              path,
              result: { failed: true, failureCount: nextFailedCount, message },
            });
          }
        }
      }
    },
  };
}
