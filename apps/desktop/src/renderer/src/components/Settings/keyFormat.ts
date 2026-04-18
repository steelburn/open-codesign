import type { SupportedOnboardingProvider } from '@open-codesign/shared';

export type KeyFormatStatus =
  | { kind: 'ok' }
  | { kind: 'wrong-prefix'; expected: string }
  | { kind: 'too-short' }
  | { kind: 'empty' }
  | { kind: 'unknown' };

interface ProviderKeyShape {
  prefix: string | null;
  minLength: number;
}

const SHAPES: Record<SupportedOnboardingProvider, ProviderKeyShape> = {
  anthropic: { prefix: 'sk-ant-', minLength: 30 },
  openai: { prefix: 'sk-', minLength: 20 },
  openrouter: { prefix: 'sk-or-', minLength: 30 },
};

/**
 * Live, lossless format check for an API key. Runs as the user types so
 * obvious paste errors (wrong prefix, accidental copy of the dashboard label)
 * are caught before the user clicks "Test". Never makes a network call.
 */
export function checkKeyFormat(
  provider: SupportedOnboardingProvider,
  key: string,
): KeyFormatStatus {
  const trimmed = key.trim();
  if (trimmed.length === 0) return { kind: 'empty' };

  const shape = SHAPES[provider];

  // Cross-family paste detection (Anthropic key into OpenAI slot, etc.).
  // Done before the prefix check so it fires even when both keys share the "sk-" prefix.
  if (provider === 'openai' && (trimmed.startsWith('sk-ant-') || trimmed.startsWith('sk-or-'))) {
    return { kind: 'wrong-prefix', expected: shape.prefix ?? '' };
  }

  if (shape.prefix !== null && !trimmed.startsWith(shape.prefix) && provider !== 'openai') {
    return { kind: 'wrong-prefix', expected: shape.prefix };
  }

  if (trimmed.length < shape.minLength) return { kind: 'too-short' };

  return { kind: 'ok' };
}
