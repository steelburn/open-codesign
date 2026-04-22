import { useT } from '@open-codesign/i18n';
import type { DiagnosticEventRow, ReportEventInput } from '@open-codesign/shared';
import { useEffect, useState } from 'react';
import { useCodesignStore } from '../../store';

export interface ReportEventDialogProps {
  eventId: number | null;
  onClose: () => void;
}

interface IncludeFlags {
  prompt: boolean;
  paths: boolean;
  urls: boolean;
  timeline: boolean;
}

const MAX_NOTES = 2000;

export function validateNotes(notes: string): boolean {
  return notes.length <= MAX_NOTES;
}

export function buildReportInput(
  eventId: number,
  notes: string,
  include: IncludeFlags,
): Omit<ReportEventInput, 'schemaVersion' | 'timeline'> {
  return {
    eventId,
    notes,
    includePromptText: include.prompt,
    includePaths: include.paths,
    includeUrls: include.urls,
    includeTimeline: include.timeline,
  };
}

const DEFAULT_INCLUDE: IncludeFlags = {
  prompt: false,
  paths: false,
  urls: false,
  timeline: true,
};

export function ReportEventDialog({ eventId, onClose }: ReportEventDialogProps) {
  const t = useT();
  const recentEvents = useCodesignStore((s) => s.recentEvents);
  const refreshDiagnosticEvents = useCodesignStore((s) => s.refreshDiagnosticEvents);
  const reportDiagnosticEvent = useCodesignStore((s) => s.reportDiagnosticEvent);

  const [notes, setNotes] = useState('');
  const [include, setInclude] = useState<IncludeFlags>(DEFAULT_INCLUDE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [triedRefresh, setTriedRefresh] = useState(false);

  // Reset state whenever the dialog opens on a new event.
  useEffect(() => {
    if (eventId !== null) {
      setNotes('');
      setInclude(DEFAULT_INCLUDE);
      setBusy(false);
      setErr(null);
      setCopied(false);
      setTriedRefresh(false);
    }
  }, [eventId]);

  const event: DiagnosticEventRow | undefined =
    eventId !== null ? recentEvents.find((e) => e.id === eventId) : undefined;

  // If the event isn't in the store yet, refresh once and retry.
  useEffect(() => {
    if (eventId === null) return;
    if (event) return;
    if (triedRefresh) return;
    setLoading(true);
    setTriedRefresh(true);
    void refreshDiagnosticEvents().finally(() => setLoading(false));
  }, [eventId, event, triedRefresh, refreshDiagnosticEvents]);

  if (eventId === null) return null;

  async function submit(kind: 'open' | 'copy') {
    if (eventId === null) return;
    if (!validateNotes(notes)) {
      setErr(`notes > ${MAX_NOTES} chars`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const result = await reportDiagnosticEvent(buildReportInput(eventId, notes, include));
      if (kind === 'open') {
        await window.codesign?.openExternal?.(result.issueUrl);
        onClose();
      } else {
        await navigator.clipboard.writeText(result.summaryMarkdown);
        setCopied(true);
        setTimeout(() => onClose(), 800);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('diagnostics.report.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] animate-[overlay-in_120ms_ease-out]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onClose();
      }}
    >
      <div
        role="document"
        className="w-full max-w-lg rounded-[var(--radius-2xl)] bg-[var(--color-background)] border border-[var(--color-border)] shadow-[var(--shadow-elevated)] p-6 space-y-4 animate-[panel-in_160ms_ease-out]"
      >
        <h3 className="text-[var(--text-md)] font-medium text-[var(--color-text-primary)]">
          {t('diagnostics.report.title')}
        </h3>

        {loading && !event ? (
          <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
            {t('diagnostics.report.loading')}
          </p>
        ) : !event ? (
          <div className="space-y-3">
            <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
              {t('diagnostics.report.eventNotFound')}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-3 rounded-[var(--radius-md)] text-[var(--text-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                {t('diagnostics.report.close')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <pre className="text-[var(--text-xs)] font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-3 whitespace-pre-wrap break-words text-[var(--color-text-primary)]">
              {`${t('diagnostics.report.error')}: ${event.code}
${t('diagnostics.report.scope')}: ${event.scope}
${t('diagnostics.report.runId')}: ${event.runId ?? '—'}
${t('diagnostics.report.fingerprint')}: ${event.fingerprint}
${t('diagnostics.report.message')}: ${event.message}`}
            </pre>

            <label className="block space-y-1">
              <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                {t('diagnostics.report.notes')}
              </span>
              <textarea
                rows={3}
                maxLength={MAX_NOTES}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--text-sm)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </label>

            <fieldset className="space-y-1.5" disabled={busy}>
              <Toggle
                label={t('diagnostics.report.include.prompt')}
                checked={include.prompt}
                onChange={(v) => setInclude((p) => ({ ...p, prompt: v }))}
              />
              <Toggle
                label={t('diagnostics.report.include.paths')}
                checked={include.paths}
                onChange={(v) => setInclude((p) => ({ ...p, paths: v }))}
              />
              <Toggle
                label={t('diagnostics.report.include.urls')}
                checked={include.urls}
                onChange={(v) => setInclude((p) => ({ ...p, urls: v }))}
              />
              <Toggle
                label={t('diagnostics.report.include.timeline')}
                checked={include.timeline}
                onChange={(v) => setInclude((p) => ({ ...p, timeline: v }))}
              />
            </fieldset>

            <p className="text-[var(--text-xs)] text-[var(--color-text-secondary)] leading-[var(--leading-body)]">
              {t('diagnostics.report.disclaimer')}
            </p>

            {err ? <p className="text-[var(--text-sm)] text-[var(--color-error)]">{err}</p> : null}
            {copied ? (
              <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                {t('diagnostics.report.copied')}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="h-9 px-3 rounded-[var(--radius-md)] text-[var(--text-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
              >
                {t('diagnostics.report.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void submit('copy')}
                disabled={busy}
                className="h-9 px-3 rounded-[var(--radius-md)] text-[var(--text-sm)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
              >
                {t('diagnostics.report.copySummary')}
              </button>
              <button
                type="button"
                onClick={() => void submit('open')}
                disabled={busy}
                className="h-9 px-3 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-[var(--color-on-accent)] text-[var(--text-sm)] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {t('diagnostics.report.openIssue')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[var(--text-sm)] text-[var(--color-text-primary)] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span>{label}</span>
    </label>
  );
}
