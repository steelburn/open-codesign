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
  stream: false;
  store: false;
  instructions?: string;
  reasoning?: CodexChatRequest['reasoning'];
  tools?: unknown[];
}

function defaultUserAgent(): string {
  return `open-codesign/0.1.0 (${process.platform}; ${process.arch})`;
}

function extractText(body: unknown): string {
  if (body === null || typeof body !== 'object') return '';
  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) return '';
  let text = '';
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const type = (item as { type?: unknown }).type;
    if (type !== 'message') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const partType = (part as { type?: unknown }).type;
      const partText = (part as { text?: unknown }).text;
      if (partType === 'output_text' && typeof partText === 'string') {
        text += partText;
      }
    }
  }
  return text;
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
      stream: false,
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

    const parsed = (await res.json()) as unknown;
    return { text: extractText(parsed), raw: parsed };
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
      Accept: 'application/json',
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
