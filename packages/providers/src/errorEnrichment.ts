/**
 * Provider-aware error enrichment. The point: when a 401 comes back from a
 * relay configured against e.g. DuckCoding, we MUST NOT echo
 * "https://api.openai.com/v1/..." in the user-facing error — the user picked
 * that relay precisely so they wouldn't talk to OpenAI. We strip raw URLs and
 * substitute provider-specific guidance (Continue parseError + Aider ExInfo
 * pattern; see docs/research/19-api-config-ux-landscape.md).
 */

import type { SupportedOnboardingProvider } from '@open-codesign/shared';

export interface EnrichInput {
  status: number | 'network';
  /** Display host of the configured base URL (NOT the underlying SDK target). */
  host: string;
  provider: SupportedOnboardingProvider;
  /** Raw response body, if any — searched for retry-after hints. */
  rawBody?: string;
  /** Retry-After header value if the provider sent one. */
  retryAfter?: string;
}

export interface EnrichedError {
  /** Short headline suitable for a toast title. */
  message: string;
  /** Actionable hint shown below the headline. Never contains underlying SDK URLs. */
  hint: string;
  /** Whether the user has any chance of fixing this themselves. */
  isUserError: boolean;
  /** Whether retrying the same request might succeed. */
  retryable: boolean;
  /** Where the user should go to fix it (e.g. provider key dashboard). */
  providerKeyUrl?: string;
}

const KEY_DASHBOARDS: Record<SupportedOnboardingProvider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  openrouter: 'https://openrouter.ai/keys',
};

const PROVIDER_LABEL: Record<SupportedOnboardingProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

function parseRetrySeconds(input: EnrichInput): number | null {
  if (input.retryAfter !== undefined) {
    const n = Number(input.retryAfter);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  if (input.rawBody !== undefined) {
    const m = input.rawBody.match(/retry[\s-]?(?:after|in)?\D{0,8}(\d{1,4})\s*(?:s|sec|seconds)?/i);
    if (m?.[1] !== undefined) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

export function enrichProviderError(input: EnrichInput): EnrichedError {
  const label = PROVIDER_LABEL[input.provider];
  const dashboardUrl = KEY_DASHBOARDS[input.provider];

  if (input.status === 'network') {
    return {
      message: `Cannot reach ${input.host}`,
      hint: 'Check your network, VPN, or proxy. The host may also be down.',
      isUserError: true,
      retryable: true,
    };
  }

  const status = input.status;

  if (status === 401) {
    return {
      message: `${label} rejected the API key`,
      hint: `Double-check the key in your ${label} dashboard. If you use a relay, the relay needs its own key — not the upstream one.`,
      isUserError: true,
      retryable: false,
      providerKeyUrl: dashboardUrl,
    };
  }

  if (status === 402) {
    return {
      message: `${label} reports no credit on the account`,
      hint: `Top up at the ${label} dashboard, or switch to a different provider.`,
      isUserError: true,
      retryable: false,
      providerKeyUrl: dashboardUrl,
    };
  }

  if (status === 403) {
    return {
      message: `${label} blocked this request (403)`,
      hint: 'Common causes: region/IP block, model not available for your tier, or the relay disallowed the call.',
      isUserError: true,
      retryable: false,
      providerKeyUrl: dashboardUrl,
    };
  }

  if (status === 404) {
    return {
      message: `${label} returned 404`,
      hint: 'The model name or path is wrong. Check the provider model list, and confirm the base URL points at the right API root.',
      isUserError: true,
      retryable: false,
    };
  }

  if (status === 429) {
    const retry = parseRetrySeconds(input);
    return {
      message: `${label} rate-limited the request`,
      hint:
        retry !== null
          ? `Retry in about ${retry}s, or switch to another provider.`
          : 'Wait a few seconds and retry, or switch to another provider.',
      isUserError: false,
      retryable: true,
    };
  }

  if (status >= 500 && status < 600) {
    return {
      message: `${label} is having issues (${status})`,
      hint: 'This is on the provider side. Try again in a moment, or switch providers.',
      isUserError: false,
      retryable: true,
    };
  }

  if (status >= 400 && status < 500) {
    return {
      message: `${label} rejected the request (${status})`,
      hint: 'The request was malformed. Check your model id, base URL, and any custom headers.',
      isUserError: true,
      retryable: false,
    };
  }

  return {
    message: `${label} returned an unexpected status (${status})`,
    hint: 'Try again, or switch providers.',
    isUserError: false,
    retryable: true,
  };
}
