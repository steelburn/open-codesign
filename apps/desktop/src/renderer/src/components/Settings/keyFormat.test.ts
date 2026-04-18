import { describe, expect, it } from 'vitest';
import { checkKeyFormat } from './keyFormat';

describe('checkKeyFormat', () => {
  it('flags empty key', () => {
    expect(checkKeyFormat('openai', '')).toEqual({ kind: 'empty' });
  });

  it('accepts well-formed Anthropic key', () => {
    expect(checkKeyFormat('anthropic', `sk-ant-${'x'.repeat(40)}`)).toEqual({ kind: 'ok' });
  });

  it('flags Anthropic key with wrong prefix', () => {
    const r = checkKeyFormat('anthropic', `sk-${'x'.repeat(40)}`);
    expect(r.kind).toBe('wrong-prefix');
    if (r.kind === 'wrong-prefix') expect(r.expected).toBe('sk-ant-');
  });

  it('flags too-short key', () => {
    expect(checkKeyFormat('openai', 'sk-abc').kind).toBe('too-short');
  });

  it('accepts OpenAI keys for OpenAI even with non-standard prefix (relays)', () => {
    // Many relays issue OpenAI-compatible keys with "sk-" prefix; some don't.
    // We only flag truly suspicious cross-provider pastes.
    const r = checkKeyFormat('openai', 'random-relay-key-12345678901234567890');
    // Will pass prefix (no enforcement for openai unless cross-family) but be too short? No, it's long enough.
    expect(r.kind).toBe('ok');
  });

  it('flags pasting Anthropic key into OpenAI slot', () => {
    const r = checkKeyFormat('openai', `sk-ant-${'x'.repeat(40)}`);
    expect(r.kind).toBe('wrong-prefix');
  });

  it('accepts OpenRouter key', () => {
    expect(checkKeyFormat('openrouter', `sk-or-${'x'.repeat(40)}`).kind).toBe('ok');
  });
});
