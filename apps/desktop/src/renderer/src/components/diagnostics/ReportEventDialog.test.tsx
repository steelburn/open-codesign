import { describe, expect, it } from 'vitest';
import { buildReportInput, validateNotes } from './ReportEventDialog';

describe('validateNotes', () => {
  it('accepts empty string', () => {
    expect(validateNotes('')).toBe(true);
  });

  it('accepts up to 2000 chars', () => {
    expect(validateNotes('x'.repeat(2000))).toBe(true);
  });

  it('rejects 2001 chars', () => {
    expect(validateNotes('x'.repeat(2001))).toBe(false);
  });
});

describe('buildReportInput', () => {
  it('returns a correctly shaped object with the 4 toggles', () => {
    const result = buildReportInput(42, 'repro steps', {
      prompt: true,
      paths: false,
      urls: true,
      timeline: false,
    });
    expect(result).toEqual({
      eventId: 42,
      notes: 'repro steps',
      includePromptText: true,
      includePaths: false,
      includeUrls: true,
      includeTimeline: false,
    });
  });

  it('passes all-default flags through', () => {
    const result = buildReportInput(1, '', {
      prompt: false,
      paths: false,
      urls: false,
      timeline: true,
    });
    expect(result.includePromptText).toBe(false);
    expect(result.includePaths).toBe(false);
    expect(result.includeUrls).toBe(false);
    expect(result.includeTimeline).toBe(true);
    expect(result.eventId).toBe(1);
    expect(result.notes).toBe('');
  });
});
