/**
 * Listens for agent:event:v1 IPC events and fans them into chatStore.
 *
 * Workstream B (Agent runtime Phase 1) will emit:
 *   - turn_start    — new assistant turn started
 *   - text_delta    — streaming token chunk
 *   - turn_end      — turn finished; finalText available
 *
 * Phase 2 adds tool_call_start / tool_call_result. This hook is
 * forward-compatible: unknown event types are ignored with a debug
 * log so a flag-gated Workstream B can land without breaking us.
 *
 * When USE_AGENT_RUNTIME is off (the default) no events fire and this
 * hook is a no-op — user/assistant_text/artifact_delivered rows are
 * written by the store during the legacy generate() path instead.
 */

import { useEffect, useRef } from 'react';
import type { AgentStreamEvent } from '../../../preload/index';
import { useCodesignStore } from '../store';

interface InFlightTurn {
  designId: string;
  generationId: string | undefined;
  textBuffer: string;
}

export function useAgentStream(): void {
  const appendChatMessage = useCodesignStore((s) => s.appendChatMessage);
  const inFlight = useRef<InFlightTurn | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.codesign) return;
    const off = window.codesign.chat.onAgentEvent((event: AgentStreamEvent) => {
      if (event.type === 'turn_start') {
        inFlight.current = {
          designId: event.designId,
          generationId: event.generationId,
          textBuffer: '',
        };
        return;
      }
      if (event.type === 'text_delta') {
        if (inFlight.current && typeof event.delta === 'string') {
          inFlight.current.textBuffer += event.delta;
        }
        return;
      }
      if (event.type === 'turn_end') {
        const current = inFlight.current;
        const finalText = event.finalText ?? current?.textBuffer ?? '';
        if (current && finalText.trim().length > 0) {
          void appendChatMessage({
            designId: current.designId,
            kind: 'assistant_text',
            payload: { text: finalText },
          });
        }
        inFlight.current = null;
        return;
      }
      if (event.type === 'tool_call_start' || event.type === 'tool_call_result') {
        // Phase 2 — persist as tool_call rows. verbGroup drives card grouping.
        void appendChatMessage({
          designId: event.designId,
          kind: 'tool_call',
          payload: {
            toolName: event.toolName ?? 'unknown',
            command: event.command,
            args: event.args ?? {},
            status: event.type === 'tool_call_result' ? 'done' : 'running',
            result: event.result,
            startedAt: new Date().toISOString(),
            durationMs: event.durationMs,
            verbGroup: event.verbGroup ?? 'Working',
          },
        });
        return;
      }
      if (event.type === 'error') {
        void appendChatMessage({
          designId: event.designId,
          kind: 'error',
          payload: {
            message: event.message ?? 'Unknown error',
            ...(event.code ? { code: event.code } : {}),
          },
        });
        return;
      }
    });
    return () => {
      off();
    };
  }, [appendChatMessage]);
}
