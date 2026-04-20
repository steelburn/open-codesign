/**
 * Sliding-window context compaction for pi-agent-core's `transformContext`
 * hook. Invoked before every LLM call to keep the message array from growing
 * unboundedly.
 *
 * The hot path (and the one that has crashed production with a 4M-token
 * request) is:
 *   - `assistant.toolCall.input` — str_replace old_str / new_str for every
 *     section edit (2-5 KB each, 30+ edits per run = 100+ KB resent every
 *     turn).
 *   - `toolResult.content` — view returns of the whole file (15-100 KB each,
 *     multiple calls per run).
 *
 * Strategy: keep the most recent `WINDOW_KEEP` tool-use rounds verbatim so the
 * model has full fidelity for its current reasoning. For older rounds,
 * replace `toolResult.content` with a one-line stub. We intentionally DO NOT
 * rewrite assistant.toolCall.input (tampering with the model's own output
 * history confuses reasoning); the savings from stubbing toolResults alone
 * are ~60-70% of historical bytes in practice.
 *
 * User messages and assistant-text-only messages always pass through unchanged.
 *
 * Safety net: if the total estimated size still exceeds `HARD_CAP_BYTES`
 * (~300 KB of assistant + toolResult text), tighten the window to the last 4
 * rounds only.
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';

const WINDOW_KEEP = 8;
const WINDOW_KEEP_AGGRESSIVE = 4;
const HARD_CAP_BYTES = 300_000;

function estimateBytes(messages: AgentMessage[]): number {
  let total = 0;
  for (const m of messages) {
    try {
      total += JSON.stringify(m).length;
    } catch {
      /* circular or unserializable — ignore */
    }
  }
  return total;
}

function isToolResult(m: AgentMessage): boolean {
  return m.role === 'toolResult';
}

function isAssistantWithToolCall(m: AgentMessage): boolean {
  if (m.role !== 'assistant') return false;
  const content = (m as { content?: Array<{ type?: string }> }).content;
  if (!Array.isArray(content)) return false;
  return content.some((c) => c?.type === 'toolCall');
}

/**
 * Count tool-use rounds (each round = one assistant message containing
 * ≥1 toolCall block). Returns the indices of each round's assistant message
 * in arrival order.
 */
function findToolUseRoundIndices(messages: AgentMessage[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    if (m && isAssistantWithToolCall(m)) out.push(i);
  }
  return out;
}

function stubToolResult(m: AgentMessage): AgentMessage {
  // Preserve the shape pi-agent-core / pi-ai need: role, matched toolCallId,
  // and a content array with at least one text block. Drop the bulky payload.
  const original = m as unknown as {
    role: 'toolResult';
    toolCallId?: string;
    content?: Array<{ type: string; text?: string }>;
  };
  const originalText = Array.isArray(original.content)
    ? (original.content.find((c) => c?.type === 'text')?.text ?? '')
    : '';
  const bytes = originalText.length;
  const firstLine = originalText.split('\n')[0]?.slice(0, 80) ?? '';
  const stub =
    bytes > 0 ? `[dropped — was ${bytes} bytes, first line: "${firstLine}"]` : '[dropped]';
  return {
    ...(original as object),
    role: 'toolResult',
    content: [{ type: 'text', text: stub }],
  } as unknown as AgentMessage;
}

export function buildTransformContext(): (
  messages: AgentMessage[],
  signal?: AbortSignal,
) => Promise<AgentMessage[]> {
  return async (messages) => {
    if (messages.length === 0) return messages;

    const roundIdxs = findToolUseRoundIndices(messages);
    // Decide how many rounds to keep. If we're already tight on bytes, fall
    // back to the aggressive window.
    let keep = WINDOW_KEEP;
    let firstKeptRoundIdx = roundIdxs.length > keep ? (roundIdxs[roundIdxs.length - keep] ?? 0) : 0;

    // First pass with the conservative window.
    const firstPass = messages.map((m, i) => {
      if (!isToolResult(m)) return m;
      if (firstKeptRoundIdx !== undefined && i >= firstKeptRoundIdx) return m;
      return stubToolResult(m);
    });

    if (estimateBytes(firstPass) <= HARD_CAP_BYTES) return firstPass;

    // Safety net: still too big — tighten to the last 4 rounds.
    keep = WINDOW_KEEP_AGGRESSIVE;
    firstKeptRoundIdx = roundIdxs.length > keep ? (roundIdxs[roundIdxs.length - keep] ?? 0) : 0;
    return messages.map((m, i) => {
      if (!isToolResult(m)) return m;
      if (firstKeptRoundIdx !== undefined && i >= firstKeptRoundIdx) return m;
      return stubToolResult(m);
    });
  };
}
