import { describe, expect, it } from 'vitest';
import { normalizeBaseUrl, resolveModelsEndpoint } from './baseUrl';

describe('normalizeBaseUrl', () => {
  it('rejects empty string', () => {
    const r = normalizeBaseUrl('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('rejects whitespace-only', () => {
    const r = normalizeBaseUrl('   \n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('strips trailing slash', () => {
    const r = normalizeBaseUrl('https://api.openai.com/v1/');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe('https://api.openai.com/v1');
  });

  it('strips multiple trailing slashes', () => {
    const r = normalizeBaseUrl('https://api.openai.com/v1///');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe('https://api.openai.com/v1');
  });

  it('adds https:// when scheme missing', () => {
    const r = normalizeBaseUrl('api.openai.com/v1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe('https://api.openai.com/v1');
  });

  it('preserves http:// when explicit', () => {
    const r = normalizeBaseUrl('http://localhost:3000/v1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe('http://localhost:3000/v1');
  });

  it('does NOT auto-append /v1', () => {
    const r = normalizeBaseUrl('https://api.anthropic.com');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized).toBe('https://api.anthropic.com');
      expect(r.hasVersionSegment).toBe(false);
    }
  });

  it('preserves /v1 when already present', () => {
    const r = normalizeBaseUrl('https://api.openai.com/v1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hasVersionSegment).toBe(true);
  });

  it('detects /v1beta as a version segment', () => {
    const r = normalizeBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Path contains /v1beta segment, so hasVersionSegment is true
      expect(r.hasVersionSegment).toBe(true);
    }
  });

  it('flags trailing /v1beta', () => {
    const r = normalizeBaseUrl('https://example.com/v1beta');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hasVersionSegment).toBe(true);
  });

  it('handles IP addresses', () => {
    const r = normalizeBaseUrl('192.168.1.10:8080/v1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe('https://192.168.1.10:8080/v1');
  });

  it('handles localhost', () => {
    const r = normalizeBaseUrl('localhost:11434');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized).toBe('https://localhost:11434');
      expect(r.host).toBe('localhost');
    }
  });

  it('preserves query string', () => {
    const r = normalizeBaseUrl('https://api.example.com/v1?key=foo');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe('https://api.example.com/v1?key=foo');
  });

  it('rejects ftp://', () => {
    const r = normalizeBaseUrl('ftp://example.com');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid');
  });

  it('rejects garbage', () => {
    const r = normalizeBaseUrl('not a url at all !!!');
    expect(r.ok).toBe(false);
  });

  it('exposes host for compact display', () => {
    const r = normalizeBaseUrl('https://api.duckcoding.ai/v1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.host).toBe('api.duckcoding.ai');
  });
});

describe('resolveModelsEndpoint', () => {
  it('appends /models when /v1 already present (openai)', () => {
    expect(resolveModelsEndpoint('https://api.openai.com/v1', 'openai')).toBe(
      'https://api.openai.com/v1/models',
    );
  });

  it('appends /v1/models when /v1 missing (openai)', () => {
    expect(resolveModelsEndpoint('https://api.openai.com', 'openai')).toBe(
      'https://api.openai.com/v1/models',
    );
  });

  it('uses /v1/models for anthropic when /v1 absent', () => {
    expect(resolveModelsEndpoint('https://api.anthropic.com', 'anthropic')).toBe(
      'https://api.anthropic.com/v1/models',
    );
  });

  it('does not double /v1 for anthropic when present', () => {
    expect(resolveModelsEndpoint('https://api.anthropic.com/v1', 'anthropic')).toBe(
      'https://api.anthropic.com/v1/models',
    );
  });
});
