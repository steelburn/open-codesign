import { randomUUID } from 'node:crypto';
import type { CodexTokenStore } from './token-store';

export const CODEX_API_BASE = 'https://chatgpt.com/backend-api/codex';

export interface CodexClientOptions {
  store: CodexTokenStore;
  accountId: string;
  originator?: string;
  sessionId?: string;
  userAgent?: string;
  /** Injectable for tests. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

export interface CodexChatRequest {
  model: string;
  /** Responses API input — transparently forwarded. */
  input: unknown;
  reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high'; summary?: 'auto' };
  tools?: unknown[];
  instructions?: string;
  signal?: AbortSignal;
}

export interface CodexChatResult {
  text: string;
  raw: unknown;
}

interface ResponsesBody {
  model: string;
  input: unknown;
  stream: true;
  store: false;
  instructions?: string;
  reasoning?: CodexChatRequest['reasoning'];
  tools?: unknown[];
}

function defaultUserAgent(): string {
  return `open-codesign/0.1.0 (${process.platform}; ${process.arch})`;
}

export class CodexClient {
  private readonly store: CodexTokenStore;
  private readonly accountId: string;
  private readonly originator: string;
  private readonly sessionId: string;
  private readonly userAgent: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: CodexClientOptions) {
    this.store = opts.store;
    this.accountId = opts.accountId;
    this.originator = opts.originator ?? 'open-codesign';
    this.sessionId = opts.sessionId ?? randomUUID();
    this.userAgent = opts.userAgent ?? defaultUserAgent();
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async chat(req: CodexChatRequest): Promise<CodexChatResult> {
    if (req.signal?.aborted) {
      throw new Error('Codex chat aborted');
    }

    const body: ResponsesBody = {
      model: req.model,
      input: req.input,
      stream: true,
      store: false,
    };
    if (req.instructions !== undefined && req.instructions.length > 0)
      body.instructions = req.instructions;
    if (req.reasoning !== undefined) body.reasoning = req.reasoning;
    if (req.tools !== undefined && req.tools.length > 0) body.tools = req.tools;

    const serialized = JSON.stringify(body);
    const url = `${CODEX_API_BASE}/responses`;

    let accessToken = await this.store.getValidAccessToken();
    let res = await this.send(url, serialized, accessToken, req.signal);

    if (res.status === 401) {
      accessToken = await this.store.forceRefresh();
      res = await this.send(url, serialized, accessToken, req.signal);
    }

    if (!res.ok) {
      const text = await safeReadText(res);
      throw new Error(`Codex chat failed: ${res.status} ${res.statusText} ${text.slice(0, 500)}`);
    }

    const { text, raw } = await consumeSseStream(res, req.signal);
    return { text, raw };
  }

  private send(
    url: string,
    body: string,
    accessToken: string,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'ChatGPT-Account-Id': this.accountId,
      originator: this.originator,
      session_id: this.sessionId,
      'User-Agent': this.userAgent,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    const init: RequestInit = { method: 'POST', headers, body };
    if (signal !== undefined) init.signal = signal;
    return this.fetchFn(url, init);
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/**
 * Consume an SSE stream from the Codex Responses endpoint. Accumulates
 * `response.output_text.delta` events into a single text string and returns
 * the last terminal event (`response.completed` or equivalent) as `raw`.
 *
 * Phase-1 greedy mode: we await the full stream before returning, so callers
 * see the same `{text, raw}` contract as the old non-streaming path. Proper
 * streaming UX (live typewriter) is layered in Phase 2.
 */
async function consumeSseStream(
  res: Response,
  signal: AbortSignal | undefined,
): Promise<{ text: string; raw: unknown }> {
  if (res.body === null) {
    throw new Error('Codex chat response has no body');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let text = '';
  let lastEvent: unknown = null;

  const flushEvent = (dataLine: string) => {
    if (dataLine.length === 0 || dataLine === '[DONE]') return;
    let payload: unknown;
    try {
      payload = JSON.parse(dataLine);
    } catch {
      return;
    }
    lastEvent = payload;
    if (payload === null || typeof payload !== 'object') return;
    const type = (payload as { type?: unknown }).type;
    if (type === 'response.output_text.delta') {
      const delta = (payload as { delta?: unknown }).delta;
      if (typeof delta === 'string') text += delta;
      return;
    }
    if (type === 'response.completed' || type === 'response.output_text.done') {
      const response = (payload as { response?: unknown }).response;
      if (response !== undefined) lastEvent = response;
    }
    if (type === 'response.error' || type === 'error') {
      const message = (payload as { message?: unknown }).message;
      throw new Error(
        typeof message === 'string' ? `Codex stream error: ${message}` : 'Codex stream error',
      );
    }
  };

  try {
    for (;;) {
      if (signal?.aborted) throw new Error('Codex chat aborted');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data:')) flushEvent(line.slice(5).trim());
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { text, raw: lastEvent };
}
