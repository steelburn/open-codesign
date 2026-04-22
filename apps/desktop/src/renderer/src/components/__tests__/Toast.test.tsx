import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_DISMISS_MS, resolveReportEventId, scheduleAutoDismiss } from '../Toast';

describe('Toast auto-dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dismisses success toasts after 5s', () => {
    const onDismiss = vi.fn();
    scheduleAutoDismiss('success', onDismiss);
    vi.advanceTimersByTime(4999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses info toasts after 5s', () => {
    const onDismiss = vi.fn();
    scheduleAutoDismiss('info', onDismiss);
    vi.advanceTimersByTime(5000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not auto-dismiss error toasts', () => {
    const onDismiss = vi.fn();
    const cleanup = scheduleAutoDismiss('error', onDismiss);
    expect(cleanup).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('cleanup cancels the pending timer', () => {
    const onDismiss = vi.fn();
    const cleanup = scheduleAutoDismiss('success', onDismiss);
    expect(cleanup).not.toBeNull();
    cleanup?.();
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('exposes 5s for non-error variants and null for error', () => {
    expect(AUTO_DISMISS_MS.success).toBe(5000);
    expect(AUTO_DISMISS_MS.info).toBe(5000);
    expect(AUTO_DISMISS_MS.error).toBeNull();
  });
});

describe('resolveReportEventId', () => {
  it('prefers the toast-provided eventId when set', () => {
    expect(resolveReportEventId(42, 7)).toBe(42);
  });
  it('falls back to the most recent diagnostic event id', () => {
    expect(resolveReportEventId(undefined, 7)).toBe(7);
  });
  it('returns null when neither is available', () => {
    expect(resolveReportEventId(undefined, undefined)).toBeNull();
  });
  it('treats 0 as a valid id (not falsy)', () => {
    expect(resolveReportEventId(0, 5)).toBe(0);
    expect(resolveReportEventId(undefined, 0)).toBe(0);
  });
});
