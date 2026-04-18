import { useT } from '@open-codesign/i18n';
import { Download } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { ExportFormat } from '../../../preload/index';
import { type GenerationStage, useCodesignStore } from '../store';

interface ExportItem {
  format: ExportFormat;
  label: string;
  hint?: string;
  ready: boolean;
}

const STAGE_TONE: Record<GenerationStage, string> = {
  idle: 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border-muted)]',
  sending:
    'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent-muted)] animate-pulse',
  thinking:
    'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent-muted)] animate-pulse',
  streaming:
    'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent-muted)] animate-pulse',
  parsing: 'bg-[#FFF4E0] text-[#9A6A1B] border-[#F1CE8B]',
  rendering: 'bg-[#FFF4E0] text-[#9A6A1B] border-[#F1CE8B]',
  done: 'bg-[#E8F5E9] text-[#2E7D32] border-[#A5D6A7]',
  error: 'bg-[#FBE9E7] text-[#C62828] border-[#FFAB91]',
};

export function PreviewToolbar(): ReactElement {
  const t = useT();
  const previewHtml = useCodesignStore((s) => s.previewHtml);
  const exportActive = useCodesignStore((s) => s.exportActive);
  const toastMessage = useCodesignStore((s) => s.toastMessage);
  const dismissToast = useCodesignStore((s) => s.dismissToast);
  const generationStage = useCodesignStore((s) => s.generationStage);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => dismissToast(), 4000);
    return () => clearTimeout(timeout);
  }, [toastMessage, dismissToast]);

  const disabled = !previewHtml;
  const exportItems: ExportItem[] = [
    {
      format: 'html',
      label: t('export.items.html.label'),
      ready: true,
      hint: t('export.items.html.hint'),
    },
    {
      format: 'pdf',
      label: t('export.items.pdf.label'),
      ready: true,
      hint: t('export.items.pdf.hint'),
    },
    {
      format: 'pptx',
      label: t('export.items.pptx.label'),
      ready: true,
      hint: t('export.items.pptx.hint'),
    },
    {
      format: 'zip',
      label: t('export.items.zip.label'),
      ready: true,
      hint: t('export.items.zip.hint'),
    },
    {
      format: 'markdown',
      label: t('export.items.markdown.label'),
      ready: true,
      hint: t('export.items.markdown.hint'),
    },
  ];

  return (
    <div className="flex items-center gap-2 px-6 py-2 border-b border-[var(--color-border-muted)] bg-[var(--color-background-secondary)]">
      <span
        className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full border text-[11px] font-medium ${STAGE_TONE[generationStage]}`}
        aria-live="polite"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
        {t(`preview.stage.${generationStage}`)}
      </span>

      {previewHtml ? (
        <span className="text-[11px] text-[var(--color-text-muted)] hidden md:inline">
          {t('preview.clickToCommentShort')}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {toastMessage && (
          <output className="text-[12px] text-[var(--color-text-secondary)] truncate max-w-[40vw]">
            {toastMessage}
          </output>
        )}

        <div className="relative" ref={ref}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-[var(--radius-md)] text-[13px] font-medium border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:pointer-events-none transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <Download className="w-[14px] h-[14px]" aria-hidden="true" />
            {t('export.button')}
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 min-w-[200px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-elevated)] py-1 z-10"
            >
              {exportItems.map((item) => (
                <button
                  key={item.format}
                  type="button"
                  role="menuitem"
                  disabled={!item.ready}
                  title={item.hint}
                  onClick={() => {
                    setOpen(false);
                    void exportActive(item.format);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-[13px] text-left text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors duration-100"
                >
                  <span>{item.label}</span>
                  {item.hint && (
                    <span className="text-[11px] text-[var(--color-text-muted)] truncate max-w-[60%]">
                      {item.hint}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
