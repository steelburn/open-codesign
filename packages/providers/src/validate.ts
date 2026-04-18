import {
  CodesignError,
  type SupportedOnboardingProvider,
  isSupportedOnboardingProvider,
  normalizeBaseUrl,
  resolveModelsEndpoint,
} from '@open-codesign/shared';
import { type EnrichedError, enrichProviderError } from './errorEnrichment';

export type ValidateResult =
  | { ok: true; modelCount: number }
  | {
      ok: false;
      code: '401' | '402' | '429' | 'network';
      message: string;
      hint?: string;
      providerKeyUrl?: string;
      retryable?: boolean;
    };

const DEFAULT_BASES: Record<SupportedOnboardingProvider, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

const PROTOCOL: Record<SupportedOnboardingProvider, 'openai' | 'anthropic'> = {
  anthropic: 'anthropic',
  openai: 'openai',
  openrouter: 'openai',
};

function buildHeaders(
  provider: SupportedOnboardingProvider,
  apiKey: string,
): Record<string, string> {
  if (provider === 'anthropic') {
    return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  }
  return { authorization: `Bearer ${apiKey}` };
}

function toLegacyCode(status: number | 'network'): '401' | '402' | '429' | 'network' {
  if (status === 'network') return 'network';
  if (status === 401 || status === 403) return '401';
  if (status === 402) return '402';
  if (status === 429) return '429';
  return 'network';
}

function toFailure(status: number | 'network', enriched: EnrichedError): ValidateResult {
  const failure: ValidateResult = {
    ok: false,
    code: toLegacyCode(status),
    message: enriched.message,
    hint: enriched.hint,
    retryable: enriched.retryable,
  };
  if (enriched.providerKeyUrl !== undefined) {
    failure.providerKeyUrl = enriched.providerKeyUrl;
  }
  return failure;
}

export async function pingProvider(
  provider: string,
  apiKey: string,
  baseUrl?: string,
): Promise<ValidateResult> {
  if (!isSupportedOnboardingProvider(provider)) {
    throw new CodesignError(
      `Provider "${provider}" is not supported in v0.1. Supported: anthropic, openai, openrouter.`,
      'PROVIDER_NOT_SUPPORTED',
    );
  }
  if (!apiKey || apiKey.trim().length === 0) {
    throw new CodesignError('API key is empty', 'PROVIDER_AUTH_MISSING');
  }

  let normalized: string;
  let host: string;
  if (baseUrl !== undefined && baseUrl.trim().length > 0) {
    const r = normalizeBaseUrl(baseUrl);
    if (!r.ok) {
      const enriched = enrichProviderError({
        provider,
        host: baseUrl,
        status: 'network',
      });
      return toFailure('network', { ...enriched, message: r.message, hint: enriched.hint });
    }
    normalized = r.normalized;
    host = r.host;
  } else {
    normalized = DEFAULT_BASES[provider];
    host = new URL(normalized).hostname;
  }

  const url = resolveModelsEndpoint(normalized, PROTOCOL[provider]);
  const headers = buildHeaders(provider, apiKey);

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers });
  } catch {
    const enriched = enrichProviderError({ provider, host, status: 'network' });
    return toFailure('network', enriched);
  }

  if (!res.ok) {
    const retryAfter = res.headers.get('retry-after') ?? undefined;
    let rawBody: string | undefined;
    try {
      rawBody = await res.clone().text();
    } catch {
      rawBody = undefined;
    }
    const enriched = enrichProviderError({
      provider,
      host,
      status: res.status,
      ...(retryAfter !== undefined ? { retryAfter } : {}),
      ...(rawBody !== undefined ? { rawBody } : {}),
    });
    return toFailure(res.status, enriched);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    const enriched = enrichProviderError({ provider, host, status: 'network' });
    return toFailure('network', { ...enriched, message: 'Invalid JSON response from provider' });
  }

  return { ok: true, modelCount: countModels(body) };
}

function countModels(body: unknown): number {
  if (body === null || typeof body !== 'object') return 0;
  const data = (body as { data?: unknown }).data;
  if (Array.isArray(data)) return data.length;
  const models = (body as { models?: unknown }).models;
  if (Array.isArray(models)) return models.length;
  return 0;
}
