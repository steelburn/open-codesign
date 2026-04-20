import { useT } from '@open-codesign/i18n';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ProviderRow } from '../../../preload/index';
import { useCodesignStore } from '../store';

interface ModelSwitcherProps {
  variant: 'topbar' | 'sidebar';
}

function shortenModelLabel(model: string): string {
  const stripped = model.replace(/^(claude-|gpt-|gemini-)/, '');
  return stripped.includes('/') ? (stripped.split('/').pop() ?? stripped) : stripped;
}

export function ModelSwitcher({ variant }: ModelSwitcherProps) {
  const t = useT();
  const config = useCodesignStore((s) => s.config);
  const setConfig = useCodesignStore((s) => s.completeOnboarding);
  const pushToast = useCodesignStore((s) => s.pushToast);

  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [providerRows, setProviderRows] = useState<ProviderRow[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const provider = config?.provider ?? null;
  const currentModel = config?.modelPrimary ?? null;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Load provider rows once — used to display the active provider's friendly label
  useEffect(() => {
    if (providerRows !== null || !window.codesign?.settings?.listProviders) return;
    void window.codesign.settings
      .listProviders()
      .then((rows) => setProviderRows(rows))
      .catch(() => setProviderRows([]));
  }, [providerRows]);

  useEffect(() => {
    if (!open || models !== null || !window.codesign?.models?.listForProvider || !provider) return;
    setLoading(true);
    void window.codesign.models
      .listForProvider(provider)
      .then((res) => setModels(res.ok ? res.models : []))
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, [open, models, provider]);

  if (!provider || !currentModel) return null;

  const activeProviderRow = providerRows?.find((r) => r.provider === provider) ?? null;
  const providerLabel = activeProviderRow?.label ?? provider;

  async function switchModel(model: string) {
    if (!window.codesign || model === currentModel) {
      setOpen(false);
      return;
    }
    try {
      const next = await window.codesign.settings.setActiveProvider({
        provider: provider!,
        modelPrimary: model,
      });
      setConfig(next);
    } catch (err) {
      pushToast({
        variant: 'error',
        title: t('settings.providers.toast.modelSaveFailed'),
        description: err instanceof Error ? err.message : t('settings.common.unknownError'),
      });
    } finally {
      setOpen(false);
      setModels(null);
    }
  }

  const isSidebar = variant === 'sidebar';

  return (
    <div ref={rootRef} className="relative w-fit">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          isSidebar
            ? 'inline-flex items-center gap-[3px] text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer'
            : 'flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-2_5)] py-[var(--space-1)] select-none hover:bg-[var(--color-surface-hover)] transition-colors'
        }
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {isSidebar ? (
          <span className="truncate" style={{ fontFamily: 'var(--font-mono)' }}>
            {currentModel}
          </span>
        ) : (
          <span className="text-[var(--text-xs)] leading-none flex items-center gap-[6px]">
            <span className="text-[var(--color-text-secondary)]">{providerLabel}</span>
            <span className="text-[var(--color-border-strong)]">·</span>
            <span
              className="text-[var(--color-text-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {shortenModelLabel(currentModel)}
            </span>
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${isSidebar ? '' : 'text-[var(--color-text-muted)]'}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className={`absolute z-50 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[var(--shadow-card)] ${
            isSidebar ? 'bottom-full mb-[var(--space-1)] left-0 min-w-[220px]' : 'top-full mt-[var(--space-1)] right-0 min-w-[260px]'
          }`}
        >
          {/* Header — show which provider preset these models belong to */}
          {!isSidebar && (
            <div className="px-[var(--space-3)] py-[var(--space-2)] border-b border-[var(--color-border-muted)]">
              <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-muted)] font-medium">
                {t('topbar.modelSwitcher.fromProvider', { defaultValue: 'Provider' })}
              </p>
              <p className="text-[12px] text-[var(--color-text-primary)] mt-[2px]">{providerLabel}</p>
            </div>
          )}

          <div className="max-h-[280px] overflow-y-auto py-[var(--space-1)]">
            {loading ? (
              <div className="flex items-center justify-center py-[var(--space-3)]">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-muted)]" />
              </div>
            ) : models && models.length > 0 ? (
              models.map((m) => {
                const isActive = m === currentModel;
                return (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => void switchModel(m)}
                    className={`relative w-full text-left px-[var(--space-3)] py-[var(--space-1_5)] text-[12px] transition-colors ${
                      isActive
                        ? 'bg-[var(--color-surface-hover)] font-medium text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'
                    }`}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-[3px] bottom-[3px] w-[2px] rounded-r-full bg-[var(--color-accent)]"
                      />
                    )}
                    {m}
                  </button>
                );
              })
            ) : (
              <div className="px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-xs)] text-[var(--color-text-muted)]">
                {t('settings.providers.noModel')}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
