import { describe, expect, it } from 'vitest';
import { enrichProviderError } from './errorEnrichment';

const base = { host: 'api.duckcoding.ai', provider: 'openai' as const };

describe('enrichProviderError', () => {
  describe('per status', () => {
    it('401 → user error, key dashboard URL, no retry', () => {
      const r = enrichProviderError({ ...base, status: 401 });
      expect(r.isUserError).toBe(true);
      expect(r.retryable).toBe(false);
      expect(r.providerKeyUrl).toContain('platform.openai.com');
      expect(r.message).toContain('rejected');
    });

    it('402 → no-credit hint, retryable false', () => {
      const r = enrichProviderError({ ...base, status: 402 });
      expect(r.message.toLowerCase()).toContain('credit');
      expect(r.retryable).toBe(false);
    });

    it('403 → region/IP/tier hint', () => {
      const r = enrichProviderError({ ...base, status: 403 });
      expect(r.message).toContain('403');
      expect(r.retryable).toBe(false);
    });

    it('404 → model name hint', () => {
      const r = enrichProviderError({ ...base, status: 404 });
      expect(r.hint.toLowerCase()).toContain('model');
    });

    it('429 → retryable, wait hint', () => {
      const r = enrichProviderError({ ...base, status: 429 });
      expect(r.retryable).toBe(true);
      expect(r.isUserError).toBe(false);
    });

    it('429 with Retry-After header → extracts seconds', () => {
      const r = enrichProviderError({ ...base, status: 429, retryAfter: '42' });
      expect(r.hint).toContain('42');
    });

    it('429 with retry-after in body → extracts seconds', () => {
      const r = enrichProviderError({
        ...base,
        status: 429,
        rawBody: '{"error":"please retry after 30s"}',
      });
      expect(r.hint).toContain('30');
    });

    it('500 → provider issues, retryable', () => {
      const r = enrichProviderError({ ...base, status: 500 });
      expect(r.retryable).toBe(true);
      expect(r.isUserError).toBe(false);
    });

    it('502 → provider issues', () => {
      const r = enrichProviderError({ ...base, status: 502 });
      expect(r.retryable).toBe(true);
    });

    it('400 → user-side malformed request', () => {
      const r = enrichProviderError({ ...base, status: 400 });
      expect(r.isUserError).toBe(true);
    });

    it('network → cannot reach host', () => {
      const r = enrichProviderError({ ...base, status: 'network' });
      expect(r.message).toContain('api.duckcoding.ai');
      expect(r.retryable).toBe(true);
    });
  });

  describe('per provider', () => {
    it('anthropic uses Anthropic label and console URL', () => {
      const r = enrichProviderError({
        host: 'api.anthropic.com',
        provider: 'anthropic',
        status: 401,
      });
      expect(r.message).toContain('Anthropic');
      expect(r.providerKeyUrl).toContain('console.anthropic.com');
    });

    it('openrouter uses OpenRouter label and openrouter.ai/keys URL', () => {
      const r = enrichProviderError({ host: 'openrouter.ai', provider: 'openrouter', status: 401 });
      expect(r.message).toContain('OpenRouter');
      expect(r.providerKeyUrl).toContain('openrouter.ai/keys');
    });
  });

  describe('URL leak prevention', () => {
    it('does NOT leak openai.com when provider is a relay (DuckCoding-style)', () => {
      const r = enrichProviderError({ host: 'api.duckcoding.ai', provider: 'openai', status: 401 });
      // The hint may mention OpenAI as the *label* (the user's chosen protocol),
      // but it must never echo a raw upstream openai.com URL.
      expect(r.hint).not.toMatch(/api\.openai\.com/);
      expect(r.message).not.toMatch(/api\.openai\.com/);
    });
  });
});
