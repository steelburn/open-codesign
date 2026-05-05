import type { DesignRunPreferencesV1 } from '@open-codesign/shared';
import type { AskAnswer, AskInput } from './tools/ask.js';

export interface RunProtocolWorkspaceState {
  hasSource: boolean;
}

export interface RunProtocolPreflightInput {
  prompt: string;
  historyCount: number;
  workspaceState: RunProtocolWorkspaceState;
  runPreferences: DesignRunPreferencesV1;
  routerQuestions?: AskInput['questions'] | undefined;
  attachmentCount?: number | undefined;
  hasReferenceUrl?: boolean | undefined;
  hasDesignSystem?: boolean | undefined;
}

export interface RunProtocolPreflightResult {
  requiresClarification: boolean;
  clarificationQuestions: AskInput['questions'];
  requiresTodosBeforeMutation: boolean;
  preflightNotes: string[];
}

export interface RunProtocolState {
  requiresTodosBeforeMutation: boolean;
  todosSet: boolean;
}

function isFreshEmpty(input: RunProtocolPreflightInput): boolean {
  return input.historyCount === 0 && !input.workspaceState.hasSource;
}

function dedupeQuestions(primary: AskInput['questions'] | undefined): AskInput['questions'] {
  const merged: AskInput['questions'] = [];
  const seen = new Set<string>();
  for (const question of primary ?? []) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    merged.push(question);
    if (merged.length >= 2) break;
  }
  return merged;
}

export function buildRunProtocolPreflight(
  input: RunProtocolPreflightInput,
): RunProtocolPreflightResult {
  const questions = dedupeQuestions(input.routerQuestions);
  const requiresTodosBeforeMutation = isFreshEmpty(input) && input.prompt.trim().length > 0;
  return {
    requiresClarification: questions.length > 0,
    clarificationQuestions: questions,
    requiresTodosBeforeMutation,
    preflightNotes: requiresTodosBeforeMutation ? ['fresh-empty-workspace'] : [],
  };
}

export function formatRunProtocolPreflightAnswers(
  answers: Pick<AskAnswer, 'questionId' | 'value'>[],
): string[] {
  const lines = answers
    .filter((answer) => typeof answer.value === 'string' && answer.value.trim().length > 0)
    .map((answer) => `- ${answer.questionId}: ${String(answer.value).trim()}`);
  return lines.length > 0 ? [['## Preflight answers', ...lines].join('\n')] : [];
}
