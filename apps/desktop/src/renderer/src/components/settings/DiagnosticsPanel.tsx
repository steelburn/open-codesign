import { useT } from '@open-codesign/i18n';
import type { DiagnosticEventRow } from '@open-codesign/shared';
import { AlertCircle, Download, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCodesignStore } from '../../store';
import { ReportEventDialog } from '../diagnostics/ReportEventDialog';

type DiagnosticsApi = NonNullable<NonNullable<Window['codesign']>['diagnostics']>;

export async function loadDiagnosticEvents(
  api: DiagnosticsApi | undefined,
  includeTransient: boolean,
): Promise<DiagnosticEventRow[]> {
  if (!api?.listEvents) return [];
  const result = await api.listEvents({ schemaVersion: 1, limit: 100, includeTransient });
  return result.events;
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

export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - ts);
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function DiagnosticsPanel() {
  const t = useT();
  const refreshDiagnosticEvents = useCodesignStore((s) => s.refreshDiagnosticEvents);
  const markDiagnosticsRead = useCodesignStore((s) => s.markDiagnosticsRead);
  const [events, setEvents] = useState<DiagnosticEventRow[]>([]);
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
    void loadDiagnosticEvents(window.codesign?.diagnostics, includeTransient).then((rows) => {
      if (!cancelled) setEvents(rows);
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
          {t('settings.diagnostics.empty')}
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
                  {formatRelativeTime(event.ts)}
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
