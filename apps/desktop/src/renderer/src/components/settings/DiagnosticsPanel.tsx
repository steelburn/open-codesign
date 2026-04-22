import { getCurrentLocale, useT } from '@open-codesign/i18n';
import type { DiagnosticEventRow } from '@open-codesign/shared';
import { AlertCircle, Download, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCodesignStore } from '../../store';
import { ReportEventDialog } from '../diagnostics/ReportEventDialog';

type DiagnosticsApi = NonNullable<NonNullable<Window['codesign']>['diagnostics']>;

export async function loadDiagnosticEvents(
  api: DiagnosticsApi | undefined,
  includeTransient: boolean,
): Promise<{ events: DiagnosticEventRow[]; dbAvailable: boolean }> {
  if (!api?.listEvents) return { events: [], dbAvailable: true };
  const result = await api.listEvents({ schemaVersion: 1, limit: 100, includeTransient });
  // `dbAvailable` is optional on the wire for backwards compat with older main
  // processes that pre-date FIX-9; default to true (optimistic) when missing.
  const dbAvailable = (result as { dbAvailable?: boolean }).dbAvailable !== false;
  return { events: result.events, dbAvailable };
}

export async function handleOpenLogFolder(api: DiagnosticsApi | undefined): Promise<void> {
  if (!api?.openLogFolder) return;
  await api.openLogFolder();
}

export async function handleExportBundle(api: DiagnosticsApi | undefined): Promise<string | null> {
  if (!api?.exportDiagnostics) return null;
  const zipPath = await api.exportDiagnostics();
  if (api.showItemInFolder) {
    void api.showItemInFolder(zipPath);
  }
  return zipPath;
}

export function truncateMessage(message: string, limit = 80): string {
  if (message.length <= limit) return message;
  return `${message.slice(0, Math.max(0, limit - 1))}…`;
}

export function formatRunIdPreview(runId: string | undefined): string {
  if (!runId) return '—';
  return runId.slice(0, 8);
}

/**
 * Localized relative-time formatter. Previously emitted raw "5s / 3m / 4h"
 * Latin shorthand regardless of locale, which looked broken to zh-CN users.
 * Uses Intl.RelativeTimeFormat so the output matches the active UI locale
 * ("5 seconds ago" / "5 秒前"). Callers should pass the current locale;
 * tests pin it explicitly so expected strings stay deterministic.
 */
export function formatRelativeTime(ts: number, now: number = Date.now(), locale = 'en'): string {
  const delta = ts - now; // negative for past timestamps
  const absSec = Math.abs(delta) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (absSec < 60) return rtf.format(Math.round(delta / 1000), 'second');
  if (absSec < 3600) return rtf.format(Math.round(delta / 60_000), 'minute');
  if (absSec < 86400) return rtf.format(Math.round(delta / 3_600_000), 'hour');
  return rtf.format(Math.round(delta / 86_400_000), 'day');
}

export function DiagnosticsPanel() {
  const t = useT();
  const locale = getCurrentLocale();
  const refreshDiagnosticEvents = useCodesignStore((s) => s.refreshDiagnosticEvents);
  const markDiagnosticsRead = useCodesignStore((s) => s.markDiagnosticsRead);
  const [events, setEvents] = useState<DiagnosticEventRow[]>([]);
  const [dbAvailable, setDbAvailable] = useState(true);
  const [includeTransient, setIncludeTransient] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportEventId, setReportEventId] = useState<number | null>(null);

  // Mount: refresh store (badge/unread) and mark panel as read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect
  useEffect(() => {
    void refreshDiagnosticEvents();
    markDiagnosticsRead();
  }, []);

  // Filter-driven fetch goes through local state — no need to bloat the store.
  useEffect(() => {
    let cancelled = false;
    void loadDiagnosticEvents(window.codesign?.diagnostics, includeTransient).then((result) => {
      if (cancelled) return;
      setEvents(result.events);
      setDbAvailable(result.dbAvailable);
    });
    return () => {
      cancelled = true;
    };
  }, [includeTransient]);

  async function onOpenLogFolder() {
    await handleOpenLogFolder(window.codesign?.diagnostics);
  }

  async function onExport() {
    setExporting(true);
    try {
      await handleExportBundle(window.codesign?.diagnostics);
    } finally {
      setExporting(false);
    }
  }

  function onReport(eventId: number) {
    setReportEventId(eventId);
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[var(--text-sm)] font-semibold text-[var(--color-text-primary)]">
          {t('settings.diagnostics.title')}
        </h3>
        <p className="text-[var(--text-xs)] text-[var(--color-text-muted)] mt-1 leading-[var(--leading-body)]">
          {t('settings.diagnostics.description')}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onOpenLogFolder()}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--text-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {t('settings.diagnostics.openLogFolder')}
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void onExport()}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--text-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" />
          {t('settings.diagnostics.exportBundle')}
        </button>
      </div>

      <label className="flex items-center gap-2 text-[var(--text-sm)] text-[var(--color-text-secondary)]">
        <input
          type="checkbox"
          checked={includeTransient}
          onChange={(e) => setIncludeTransient(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        {t('settings.diagnostics.showTransient')}
      </label>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-[var(--text-sm)] text-[var(--color-text-muted)]">
          <AlertCircle className="w-5 h-5" />
          {dbAvailable ? t('settings.diagnostics.empty') : t('settings.diagnostics.dbUnavailable')}
        </div>
      ) : (
        <table className="w-full text-[var(--text-sm)] border-t border-[var(--color-border-subtle)]">
          <thead>
            <tr className="text-left text-[var(--text-xs)] text-[var(--color-text-muted)]">
              <th className="py-2 pr-3 font-medium">{t('settings.diagnostics.column.time')}</th>
              <th className="py-2 pr-3 font-medium">{t('settings.diagnostics.column.code')}</th>
              <th className="py-2 pr-3 font-medium">{t('settings.diagnostics.column.scope')}</th>
              <th className="py-2 pr-3 font-medium">{t('settings.diagnostics.column.runId')}</th>
              <th className="py-2 pr-3 font-medium">{t('settings.diagnostics.column.message')}</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                className="border-t border-[var(--color-border-subtle)] align-top text-[var(--color-text-secondary)]"
              >
                <td
                  className="py-2 pr-3 whitespace-nowrap"
                  title={new Date(event.ts).toISOString()}
                >
                  {formatRelativeTime(event.ts, Date.now(), locale)}
                </td>
                <td className="py-2 pr-3 font-mono text-[var(--text-xs)]">{event.code}</td>
                <td className="py-2 pr-3">{event.scope}</td>
                <td className="py-2 pr-3 font-mono text-[var(--text-xs)]">
                  {formatRunIdPreview(event.runId)}
                </td>
                <td className="py-2 pr-3 text-[var(--color-text-primary)]">
                  {truncateMessage(event.message)}
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => onReport(event.id)}
                    className="inline-flex items-center h-7 px-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--text-xs)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    {t('settings.diagnostics.report')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ReportEventDialog eventId={reportEventId} onClose={() => setReportEventId(null)} />
    </div>
  );
}
