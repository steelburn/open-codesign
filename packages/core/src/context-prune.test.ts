import { describe, expect, it } from 'vitest';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { buildTransformContext } from './context-prune.js';

function userMsg(text: string): AgentMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
  } as unknown as AgentMessage;
}

function assistantWithToolCall(toolCallId: string, big: string): AgentMessage {
  return {
    role: 'assistant',
    content: [
      { type: 'text', text: 'ok' },
      { type: 'toolCall', id: toolCallId, name: 'str_replace_based_edit_tool', input: { big } },
    ],
  } as unknown as AgentMessage;
}

function toolResult(toolCallId: string, body: string): AgentMessage {
  return {
    role: 'toolResult',
    toolCallId,
    content: [{ type: 'text', text: body }],
  } as unknown as AgentMessage;
}

function assistantText(text: string): AgentMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
  } as unknown as AgentMessage;
}

describe('buildTransformContext — sliding-window compaction', () => {
  it('is a no-op when well under the cap', async () => {
    const transform = buildTransformContext();
    const messages: AgentMessage[] = [
      userMsg('hi'),
      assistantWithToolCall('t1', 'small'),
      toolResult('t1', 'small result'),
      assistantText('done'),
    ];
    const out = await transform(messages);
    expect(out).toEqual(messages);
  });

  it('leaves the last 8 tool-use rounds verbatim, stubs older toolResult content', async () => {
    const transform = buildTransformContext();
    const messages: AgentMessage[] = [userMsg('build this')];
    // 12 tool-use rounds, each with a bulky toolResult body so older ones
    // should be stubbed.
    const bulk = 'x'.repeat(2_000);
    for (let i = 0; i < 12; i += 1) {
      messages.push(assistantWithToolCall(`t${i}`, `args-${i}`));
      messages.push(toolResult(`t${i}`, `result body ${i} ${bulk}`));
    }
    const out = await transform(messages);
    // First few toolResult rows should be stubbed, last 8 should still be
    // original-shaped.
    const resultRows = out.filter((m) => m.role === 'toolResult');
    expect(resultRows).toHaveLength(12);
    const early = resultRows.slice(0, 4);
    const recent = resultRows.slice(-8);
    for (const row of early) {
      const first = (row as { content: Array<{ text?: string }> }).content[0]?.text ?? '';
      expect(first.startsWith('[dropped')).toBe(true);
    }
    for (const row of recent) {
      const first = (row as { content: Array<{ text?: string }> }).content[0]?.text ?? '';
      expect(first.startsWith('result body')).toBe(true);
    }
  });

  it('keeps the toolCallId on stubbed toolResult rows (pi-ai shape requirement)', async () => {
    const transform = buildTransformContext();
    const messages: AgentMessage[] = [userMsg('x')];
    const bulk = 'y'.repeat(3_000);
    for (let i = 0; i < 10; i += 1) {
      messages.push(assistantWithToolCall(`call-${i}`, 'a'));
      messages.push(toolResult(`call-${i}`, `body ${bulk}`));
    }
    const out = await transform(messages);
    // Oldest round's toolResult must still carry the matching toolCallId so
    // the LLM can pair it with the assistant toolCall block.
    const first = out.find(
      (m) =>
        m.role === 'toolResult' &&
        (m as { toolCallId?: string }).toolCallId === 'call-0',
    ) as { toolCallId?: string; content: Array<{ text?: string }> } | undefined;
    expect(first).toBeDefined();
    expect(first?.toolCallId).toBe('call-0');
    expect(first?.content[0]?.text?.startsWith('[dropped')).toBe(true);
  });

  it('preserves user messages and assistant-text messages unchanged', async () => {
    const transform = buildTransformContext();
    const bulk = 'z'.repeat(3_000);
    const messages: AgentMessage[] = [
      userMsg('initial brief, do not mangle'),
      assistantText('I will start now.'),
    ];
    for (let i = 0; i < 10; i += 1) {
      messages.push(assistantWithToolCall(`c${i}`, 'op'));
      messages.push(toolResult(`c${i}`, `r ${bulk}`));
    }
    messages.push(assistantText('final summary line'));
    const out = await transform(messages);
    // User message identity preserved.
    const firstUser = out.find((m) => m.role === 'user');
    expect(firstUser).toBe(messages[0]);
    // Non-tool-call assistant text preserved.
    const openingNote = out.find(
      (m) =>
        m.role === 'assistant' &&
        (m as { content: Array<{ type: string; text?: string }> }).content.every(
          (c) => c.type === 'text',
        ),
    );
    expect(openingNote).toBeDefined();
  });

  it('tightens to the aggressive 4-round window when HARD_CAP_BYTES is exceeded', async () => {
    const transform = buildTransformContext();
    const messages: AgentMessage[] = [userMsg('go')];
    // Stuff assistant content with very large payloads so even after stubbing
    // older toolResults the total still exceeds the 300 KB cap.
    const hugeArgs = 'p'.repeat(40_000);
    for (let i = 0; i < 12; i += 1) {
      messages.push(assistantWithToolCall(`big-${i}`, hugeArgs));
      messages.push(toolResult(`big-${i}`, 'small-response'));
    }
    const out = await transform(messages);
    // In aggressive mode only the last 4 toolResult rows stay verbatim. Even
    // though the results are small here, we just verify the stub count rose:
    // older-than-last-4 rows should all be stubbed.
    const results = out.filter((m) => m.role === 'toolResult');
    const stubbed = results.filter((m) =>
      ((m as { content: Array<{ text?: string }> }).content[0]?.text ?? '').startsWith('[dropped'),
    );
    expect(stubbed.length).toBeGreaterThanOrEqual(8);
  });
});
