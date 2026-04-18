/**
 * Single canonical baseUrl normalizer. Replaces the scattered string
 * concatenation that lived in pingProvider, AddProviderModal, and the
 * onboarding flow. See docs/research/19-api-config-ux-landscape.md
 * (Cherry Studio formatApiHost pattern).
 *
 * Rules (intentionally conservative):
 *   - trim whitespace
 *   - strip trailing slash
 *   - default to https:// when no protocol is present
 *   - DO NOT auto-append /v1 — Anthropic uses /v1/messages, ollama uses
 *     /api/chat, and openai-compatible relays already include /v1 in their
 *     pasted URL. Adding it silently would corrupt half of them.
 *
 * Returns a discriminated union so callers can render the failure reason
 * inline (UX requirement: live preview below input).
 */

export type NormalizeBaseUrlOk = {
  ok: true;
  /** Normalized URL safe to pass to fetch() — no trailing slash, scheme guaranteed. */
  normalized: string;
  /** Hostname only, for compact UI display. */
  host: string;
  /** Whether the URL ends in /v1 (or /v1beta etc.) — used to skip auto-appending. */
  hasVersionSegment: boolean;
};

export type NormalizeBaseUrlError = {
  ok: false;
  reason: 'empty' | 'invalid';
  message: string;
};

export type NormalizeBaseUrlResult = NormalizeBaseUrlOk | NormalizeBaseUrlError;

const VERSION_SEGMENT_RE = /\/v\d+[a-z]*(\/|$)/i;

export function normalizeBaseUrl(input: string): NormalizeBaseUrlResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty', message: 'Base URL is empty' };
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'invalid', message: 'Not a valid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'invalid', message: `Unsupported protocol: ${parsed.protocol}` };
  }

  if (parsed.hostname.length === 0) {
    return { ok: false, reason: 'invalid', message: 'Missing hostname' };
  }

  // Strip trailing slash from pathname so we can deterministically join paths later.
  const pathname = parsed.pathname.replace(/\/+$/, '');
  const search = parsed.search;
  const hash = parsed.hash;
  const port = parsed.port.length > 0 ? `:${parsed.port}` : '';

  const normalized = `${parsed.protocol}//${parsed.hostname}${port}${pathname}${search}${hash}`;
  const hasVersionSegment = VERSION_SEGMENT_RE.test(pathname);

  return { ok: true, normalized, host: parsed.hostname, hasVersionSegment };
}

/**
 * Build the *resolved endpoint* for a provider's connection test, using the
 * normalized base URL. This is what we display below the input so the user
 * can see exactly which URL the next request will hit.
 *
 * For OpenAI-compatible relays we always test against `/v1/models` — if the
 * pasted URL already ends in /v1 we don't double it. Anthropic always uses
 * `/v1/models` regardless of whether the pasted URL already has /v1.
 */
export function resolveModelsEndpoint(
  normalized: string,
  protocol: 'openai' | 'anthropic',
): string {
  if (protocol === 'anthropic') {
    // Anthropic accepts both api.anthropic.com and api.anthropic.com/v1; we
    // strip a trailing /v1 then re-append /v1/models so the result is stable.
    const stripped = normalized.replace(/\/v1$/i, '');
    return `${stripped}/v1/models`;
  }
  // openai-compatible
  if (/\/v\d+[a-z]*(\/|$)/i.test(normalized)) {
    return `${normalized}/models`;
  }
  return `${normalized}/v1/models`;
}
