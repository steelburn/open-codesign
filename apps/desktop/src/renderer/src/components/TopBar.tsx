import { useT } from '@open-codesign/i18n';
import { IconButton, Wordmark } from '@open-codesign/ui';
import { ArrowLeft, FolderOpen, Settings as SettingsIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { type HubTab, useCodesignStore } from '../store';
import { LanguageToggle } from './LanguageToggle';
import { ModelSwitcher } from './ModelSwitcher';
import { ThemeToggle } from './ThemeToggle';

const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties;

const HUB_TABS: HubTab[] = ['recent', 'your', 'examples', 'designSystems'];


export function TopBar() {
  const t = useT();
  const setView = useCodesignStore((s) => s.setView);
  const view = useCodesignStore((s) => s.view);
  const previousView = useCodesignStore((s) => s.previousView);
  const currentDesignId = useCodesignStore((s) => s.currentDesignId);
  const designs = useCodesignStore((s) => s.designs);
  const currentDesign = designs.find((d) => d.id === currentDesignId);
  const hubTab = useCodesignStore((s) => s.hubTab);
  const setHubTab = useCodesignStore((s) => s.setHubTab);

  return (
    <header
      className="h-[var(--size-titlebar-height)] shrink-0 flex items-center justify-between pr-[var(--space-6)] select-none"
      style={{
        ...dragStyle,
        paddingLeft: 'var(--space-4)',
        borderBottom: '1px solid oklch(0.22 0.025 50 / 0.08)',
        background: 'var(--color-background)',
      }}
    >
      <div className="flex items-center gap-[var(--space-8)] min-w-0 h-full" style={noDragStyle}>
        <Wordmark badge={t('common.preAlpha')} size="md" />

        {view === 'settings' ? (
          <div className="flex items-center gap-[var(--space-2)]">
            <span style={{ color: 'oklch(0.22 0.025 50 / 0.2)' }}>/</span>
            <button
              type="button"
              onClick={() => setView(previousView === 'settings' ? 'hub' : previousView)}
              aria-label={t('topbar.closeSettings')}
              className="inline-flex items-center gap-[6px] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] transition-colors duration-[var(--duration-faster)]"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '19px',
                letterSpacing: '-0.015em',
                color: 'var(--color-text-secondary)',
              }}
            >
              <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
              <span>{t('topbar.settingsLabel')}</span>
            </button>
          </div>
        ) : view === 'hub' ? (
          <nav
            className="flex items-center gap-[var(--space-8)] h-full"
            aria-label={t('hub.tabs.your')}
          >
            {HUB_TABS.map((tab) => {
              const active = tab === hubTab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setHubTab(tab)}
                  aria-current={active ? 'page' : undefined}
                  className="relative h-full inline-flex items-center transition-colors duration-[var(--duration-faster)]"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '19px',
                    fontWeight: active ? 500 : 400,
                    color: active
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-muted)',
                    letterSpacing: '-0.015em',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.color = 'var(--color-text-muted)';
                  }}
                >
                  {t(`hub.tabs.${tab}`)}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute left-0 right-0 bottom-[-1px] h-[2px] rounded-full"
                      style={{ background: 'var(--color-accent)' }}
                    />
                  ) : null}
                </button>
              );
            })}
          </nav>
        ) : (
          <div className="flex items-center gap-[var(--space-2)]">
            <span style={{ color: 'oklch(0.22 0.025 50 / 0.2)' }}>/</span>
            <button
              type="button"
              onClick={() => setView('hub')}
              aria-label={t('topbar.openMyDesigns')}
              className="inline-flex items-center gap-[6px] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] transition-colors duration-[var(--duration-faster)] max-w-[280px]"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '19px',
                letterSpacing: '-0.015em',
                color: 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-text-primary)';
                e.currentTarget.style.background = 'var(--color-surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-secondary)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <FolderOpen className="w-4 h-4 shrink-0" aria-hidden />
              <span className="truncate">{currentDesign?.name ?? t('sidebar.noDesign')}</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-[var(--space-3)]" style={noDragStyle}>
        <ModelSwitcher variant="topbar" />
        <div
          className="flex items-center gap-[2px]"
          style={{ marginLeft: 'var(--space-1)' }}
        >
          <LanguageToggle />
          <ThemeToggle />
          <IconButton
            label={t('settings.title')}
            size="md"
            onClick={() => setView('settings')}
          >
            <SettingsIcon className="w-[18px] h-[18px]" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
