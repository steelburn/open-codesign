import { useT } from '@open-codesign/i18n';
import { IconButton, Tooltip, Wordmark } from '@open-codesign/ui';
import { Command, GitBranch, Pencil, RefreshCcw, Settings as SettingsIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCodesignStore } from '../store';
import { ConnectionStatusDot } from './ConnectionStatusDot';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';

const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties;

// Shell badge — mock data. Full cost accounting tracked separately.
function ByokBadge() {
  const t = useT();
  const config = useCodesignStore((s) => s.config);

  const provider = config?.provider ?? null;
  const model = config?.modelPrimary ?? null;

  if (!provider || !model) return null;

  // Shorten common provider names for display
  const providerLabel =
    provider === 'anthropic'
      ? 'Claude'
      : provider === 'openai'
        ? 'OpenAI'
        : provider === 'openrouter'
          ? 'OpenRouter'
          : provider;

  // Truncate model slug to the key qualifier (e.g. "claude-sonnet-4-5" → "sonnet-4-5")
  const modelLabel = model.replace(/^(claude-|gpt-|gemini-)/, '');
  // Short label drops a leading provider segment (e.g. "openrouter/elephant-alpha" → "elephant-alpha")
  const shortModelLabel = modelLabel.includes('/')
    ? (modelLabel.split('/').pop() ?? modelLabel)
    : modelLabel;
  const hasFullForm = shortModelLabel !== modelLabel;

  return (
    <div
      className="group flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-2)] py-[var(--space-1)] select-none"
      title={`${t('topbar.byokTitle')} — ${providerLabel} · ${modelLabel}`}
    >
      {/* Provider + model chip — short slug always visible; full form expands on hover */}
      <span className="text-[var(--text-xs)] text-[var(--color-text-secondary)] leading-none">
        {providerLabel}
        <span className="mx-[var(--space-1)] text-[var(--color-border-strong)]">·</span>
        {hasFullForm ? (
          <>
            <span className="text-[var(--color-text-muted)] group-hover:hidden">
              {shortModelLabel}
            </span>
            <span className="hidden text-[var(--color-text-muted)] group-hover:inline">
              {modelLabel}
            </span>
          </>
        ) : (
          <span className="text-[var(--color-text-muted)]">{modelLabel}</span>
        )}
      </span>

      <span className="w-px h-[var(--size-icon-xs)] bg-[var(--color-border)]" aria-hidden="true" />

      {/* Cost this week — tabular mono numerals */}
      <Tooltip label={t('topbar.spendTooltip')}>
        <span
          className="text-[var(--text-xs)] text-[var(--color-text-secondary)] leading-none"
          style={{ fontFamily: 'var(--font-mono)', fontFeatureSettings: "'tnum'" }}
        >
          $0.00
          <span
            className="ml-[var(--space-1)] text-[var(--color-text-muted)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {t('topbar.spendThisWeek')}
          </span>
        </span>
      </Tooltip>
    </div>
  );
}

export interface TopBarProps {
  onReuseLastPrompt?: (prompt: string) => void;
}

export function TopBar({ onReuseLastPrompt }: TopBarProps = {}) {
  const t = useT();
  const previewHtml = useCodesignStore((s) => s.previewHtml);
  const isGenerating = useCodesignStore((s) => s.isGenerating);
  const errorMessage = useCodesignStore((s) => s.errorMessage);
  const setView = useCodesignStore((s) => s.setView);
  const messages = useCodesignStore((s) => s.messages);
  const config = useCodesignStore((s) => s.config);
  const openCommandPalette = useCodesignStore((s) => s.openCommandPalette);
  const regenerateLast = useCodesignStore((s) => s.regenerateLast);
  const reuseLastPrompt = useCodesignStore((s) => s.reuseLastPrompt);
  const pushToast = useCodesignStore((s) => s.pushToast);

  let crumb = t('preview.noDesign');
  if (errorMessage) crumb = t('preview.error.title');
  else if (isGenerating) crumb = t('preview.loading.title');
  else if (previewHtml) crumb = t('preview.ready');

  const provider = config?.provider ?? null;
  const model = config?.modelPrimary ?? null;
  const hasHistory = messages.length > 0;

  function handleReuse(): void {
    const prompt = reuseLastPrompt();
    if (!prompt) return;
    onReuseLastPrompt?.(prompt);
  }

  function handleBranch(): void {
    pushToast({
      variant: 'info',
      title: t('notifications.branchQueued'),
      description: t('notifications.branchQueuedDescription'),
    });
  }

  return (
    <header
      className="h-[var(--size-titlebar-height)] shrink-0 flex items-center justify-between pl-[var(--size-titlebar-pad-left)] pr-[var(--space-4)] border-b border-[var(--color-border)] bg-[var(--color-background)] select-none"
      style={dragStyle}
    >
      <div className="flex items-center gap-[var(--space-3)] min-w-0">
        <Wordmark badge={t('common.preAlpha')} size="sm" />
        <span className="text-[var(--color-text-muted)]">/</span>
        <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)] truncate">
          {crumb}
        </span>
        <ConnectionStatusDot />
        <span className="text-[var(--color-text-muted)] hidden sm:inline">·</span>
        <span className="text-[11px] text-[var(--color-text-muted)] hidden sm:inline truncate max-w-[14rem]">
          {provider ?? t('topbar.session.noProvider')}
          <span className="mx-1 opacity-60">·</span>
          {model ?? t('topbar.session.noModel')}
          <span className="mx-1 opacity-60">·</span>
          {t('topbar.session.tokensPlaceholder')}
        </span>
      </div>

      <div className="flex items-center gap-[var(--space-2)]" style={noDragStyle}>
        {hasHistory ? (
          <>
            <Tooltip label={t('topbar.iterate.regenerate')}>
              <IconButton
                size="sm"
                label={t('topbar.iterate.regenerate')}
                onClick={() => void regenerateLast()}
                disabled={isGenerating}
              >
                <RefreshCcw className="w-[var(--size-icon-md)] h-[var(--size-icon-md)]" />
              </IconButton>
            </Tooltip>
            <Tooltip label={t('topbar.iterate.reuse')}>
              <IconButton
                size="sm"
                label={t('topbar.iterate.reuse')}
                onClick={handleReuse}
                disabled={isGenerating || !onReuseLastPrompt}
              >
                <Pencil className="w-[var(--size-icon-md)] h-[var(--size-icon-md)]" />
              </IconButton>
            </Tooltip>
            <Tooltip label={t('topbar.iterate.branch')}>
              <IconButton
                size="sm"
                label={t('topbar.iterate.branch')}
                onClick={handleBranch}
                disabled={isGenerating}
              >
                <GitBranch className="w-[var(--size-icon-md)] h-[var(--size-icon-md)]" />
              </IconButton>
            </Tooltip>
            <span
              className="w-px h-[var(--size-icon-md)] bg-[var(--color-border)] mx-[var(--space-1)]"
              aria-hidden="true"
            />
          </>
        ) : null}
        <ByokBadge />
        <div className="flex items-center gap-[var(--space-1)]">
          <Tooltip label={t('commands.tooltips.commandPalette')}>
            <IconButton label={t('commands.openPalette')} size="sm" onClick={openCommandPalette}>
              <Command className="w-[var(--size-icon-md)] h-[var(--size-icon-md)]" />
            </IconButton>
          </Tooltip>
          <LanguageToggle />
          <ThemeToggle />
          <Tooltip label={t('commands.tooltips.settings')}>
            <IconButton
              label={t('commands.items.openSettings')}
              size="sm"
              onClick={() => setView('settings')}
            >
              <SettingsIcon className="w-[var(--size-icon-md)] h-[var(--size-icon-md)]" />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
