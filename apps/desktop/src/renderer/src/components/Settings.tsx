import { useT } from '@open-codesign/i18n';
import { Cpu, FolderOpen, Palette, Sliders } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type SettingsTab, useCodesignStore } from '../store';
import { AdvancedTab } from './settings/AdvancedTab';
import { AppearanceTab } from './settings/AppearanceTab';
import { DiagnosticsPanel } from './settings/DiagnosticsPanel';
import { ImageGenerationTab } from './settings/ImageGenerationTab';
import { MemoryTab } from './settings/MemoryTab';
import { ModelsTab } from './settings/ModelsTab';
import { StorageTab } from './settings/StorageTab';

export { resolveTimeoutOptions, TIMEOUT_OPTION_SECONDS } from './settings/AdvancedTab';
// Re-exports so Settings.test.ts keeps its public entry points. The actual
// implementations live in the per-tab modules.
export { applyLocaleChange } from './settings/AppearanceTab';
export { computeModelOptions } from './settings/primitives';

type Tab = 'models' | 'appearance' | 'workspace' | 'advanced';

const TABS: ReadonlyArray<{ id: Tab; icon: typeof Cpu }> = [
  { id: 'models', icon: Cpu },
  { id: 'appearance', icon: Palette },
  { id: 'workspace', icon: FolderOpen },
  { id: 'advanced', icon: Sliders },
];

function primarySettingsTab(tab: SettingsTab | null): Tab {
  if (tab === 'appearance') return 'appearance';
  if (tab === 'storage' || tab === 'workspace') return 'workspace';
  if (tab === 'memory' || tab === 'diagnostics' || tab === 'advanced') return 'advanced';
  return 'models';
}

export function Settings() {
  const t = useT();
  const initialTab = useCodesignStore((s) => s.settingsTab);
  const clearSettingsTab = useCodesignStore((s) => s.clearSettingsTab);
  const [tab, setTab] = useState<Tab>(primarySettingsTab(initialTab));

  // Consume the store hint exactly once on mount so future Settings opens
  // start on whatever the user last selected manually.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect
  useEffect(() => {
    if (initialTab) clearSettingsTab();
  }, []);

  return (
    <div className="h-full flex flex-col bg-[var(--color-background)]">
      <div className="flex-1 grid grid-cols-[11rem_1fr] min-h-0 max-[860px]:grid-cols-1">
        <aside className="bg-[var(--color-background-secondary)] border-r border-[var(--color-border)] p-[var(--space-3)] max-[860px]:border-r-0 max-[860px]:border-b">
          <nav className="codesign-scroll-x flex gap-[var(--space-1)] overflow-x-auto max-[860px]:pb-[var(--space-1)] min-[861px]:block min-[861px]:space-y-0.5">
            {TABS.map((entry) => {
              const Icon = entry.icon;
              const active = tab === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  className={`relative flex w-full min-w-max items-center gap-2 rounded-[var(--radius-md)] py-[var(--space-2)] pl-[var(--space-3)] pr-[var(--space-2)] text-[var(--text-sm)] whitespace-nowrap transition-[background-color,color,transform] duration-[var(--duration-faster)] active:scale-[var(--scale-press-down)] min-[861px]:min-w-0 ${
                    active
                      ? 'bg-[var(--color-surface-active)] text-[var(--color-text-primary)] font-medium before:absolute before:left-0 before:top-[var(--space-1_5)] before:bottom-[var(--space-1_5)] before:w-[var(--size-accent-stripe)] before:rounded-full before:bg-[var(--color-accent)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {t(`settings.tabs.${entry.id}`)}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="codesign-scroll-area flex flex-col min-h-0 overflow-y-auto p-[clamp(var(--space-4),3vw,var(--space-6))]">
          {tab === 'models' ? (
            <div className="space-y-[var(--space-6)]">
              <ModelsTab />
              <ImageGenerationTab />
            </div>
          ) : null}
          {tab === 'appearance' ? <AppearanceTab /> : null}
          {tab === 'workspace' ? <StorageTab /> : null}
          {tab === 'advanced' ? (
            <div className="space-y-[var(--space-6)]">
              <MemoryTab />
              <DiagnosticsPanel />
              <AdvancedTab />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
