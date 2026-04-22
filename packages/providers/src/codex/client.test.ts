import { afterEach, describe, expect, it, vi } from 'vitest';
import { CODEX_API_BASE, CodexClient } from './client';
import type { CodexTokenStore } from './token-store';

interface MockStore {
  getValidAccessToken: ReturnType<typeof vi.fn>;
  forceRefresh: ReturnType<typeof vi.fn>;
}

function makeStore(overrides: Partial<MockStore> = {}): {
  store: CodexTokenStore;
  mock: MockStore;
} {
  const mock: MockStore = {
    getValidAccessToken: overrides.getValidAccessToken ?? vi.fn().mockResolvedValue('access-1'),
    forceRefresh: overrides.forceRefresh ?? vi.fn().mockResolvedValue('access-2'),
  };
  return { store: mock as unknown as CodexTokenStore, mock };
}

function jsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status: number, statusText: string): Response {
  return new Response(body, { status, statusText });
}

const SAMPLE_RESPONSE = {
  output: [
    {
      type: 'message',
      content: [{ type: 'output_text', text: 'hello world' }],
    },
  ],
};

describe('CodexClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: POSTs to /responses with required headers and parses text', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(SAMPLE_RESPONSE));
    const { store } = makeStore();
    const client = new CodexClient({
      store,
      accountId: 'acct-1',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = await client.chat({
      model: 'gpt-5.3-codex',
      input: [{ role: 'user', content: 'hi' }],
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CODEX_API_BASE}/responses`);
    expect(url).toBe('https://chatgpt.com/backend-api/codex/responses');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer access-1');
    expect(headers['ChatGPT-Account-Id']).toBe('acct-1');
    expect(headers['originator']).toBe('open-codesign');
    expect(headers['session_id']).toBeTruthy();
    expect(headers['User-Agent']).toBeTruthy();
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Accept']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-5.3-codex');
    expect(body.input).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.stream).toBe(false);
    expect(body.store).toBe(false);

    expect(result.text).toBe('hello world');
    expect(result.raw).toEqual(SAMPLE_RESPONSE);
  });

  it('respects custom originator', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(SAMPLE_RESPONSE));
    const { store } = makeStore();
    const client = new CodexClient({
      store,
      accountId: 'acct-1',
      originator: 'test-app',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await client.chat({ model: 'm', input: [] });

    const headers = (fetchFn.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers['originator']).toBe('test-app');
  });

  it('reuses session_id across calls', async () => {
    const fetchFn = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse(SAMPLE_RESPONSE)));
    const { store } = makeStore();
    const client = new CodexClient({
      store,
      accountId: 'acct-1',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await client.chat({ model: 'm', input: [] });
    await client.chat({ model: 'm', input: [] });

    const h1 = (fetchFn.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    const h2 = (fetchFn.mock.calls[1] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(h1['session_id']).toBe(h2['session_id']);
    expect(h1['session_id']?.length ?? 0).toBeGreaterThan(0);
  });

  it('retries once on 401 using forceRefresh', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(textResponse('nope', 401, 'Unauthorized'))
      .mockResolvedValueOnce(jsonResponse(SAMPLE_RESPONSE));
    const getValidAccessToken = vi.fn().mockResolvedValue('access-old');
    const forceRefresh = vi.fn().mockResolvedValue('access-new');
    const { store } = makeStore({ getValidAccessToken, forceRefresh });
    const client = new CodexClient({
      store,
      accountId: 'acct-1',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = await client.chat({ model: 'm', input: [] });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(forceRefresh).toHaveBeenCalledTimes(1);

    const h1 = (fetchFn.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    const h2 = (fetchFn.mock.calls[1] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(h1['Authorization']).toBe('Bearer access-old');
    expect(h2['Authorization']).toBe('Bearer access-new');
    expect(result.text).toBe('hello world');
  });

  it('throws if 401 twice', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(textResponse('nope', 401, 'Unauthorized'))
      .mockResolvedValueOnce(textResponse('still nope', 401, 'Unauthorized'));
    const forceRefresh = vi.fn().mockResolvedValue('access-new');
    const { store } = makeStore({ forceRefresh });
    const client = new CodexClient({
      store,
      accountId: 'acct-1',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.chat({ model: 'm', input: [] })).rejects.toThrow(/401/);
    expect(forceRefresh).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on non-401 error (429) without refresh', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(textResponse('slow down', 429, 'Too Many Requests'));
    const forceRefresh = vi.fn();
    const { store } = makeStore({ forceRefresh });
    const client = new CodexClient({
      store,
      accountId: 'acct-1',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.chat({ model: 'm', input: [] })).rejects.toThrow(/429/);
    expect(forceRefresh).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('throws without calling fetch when signal is pre-aborted', async () => {
    const fetchFn = vi.fn();
    const { store } = makeStore();
    const client = new CodexClient({
      store,
      accountId: 'acct-1',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const ctrl = new AbortController();
    ctrl.abort();

    await expect(client.chat({ model: 'm', input: [], signal: ctrl.signal })).rejects.toThrow(
      'Codex chat aborted',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('passes reasoning and tools through in the body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(SAMPLE_RESPONSE));
    const { store } = makeStore();
    const client = new CodexClient({
      store,
      accountId: 'acct-1',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const tools = [{ type: 'function', name: 'foo' }];
    const reasoning = { effort: 'high' as const, summary: 'auto' as const };
    await client.chat({ model: 'm', input: [], reasoning, tools });

    const body = JSON.parse((fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.reasoning).toEqual(reasoning);
    expect(body.tools).toEqual(tools);
  });

  it('returns empty text on unexpected response shapes without throwing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ output: [] }));
    const { store } = makeStore();
    const client = new CodexClient({
      store,
      accountId: 'acct-1',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = await client.chat({ model: 'm', input: [] });
    expect(result.text).toBe('');
    expect(result.raw).toEqual({ output: [] });
  });
});
