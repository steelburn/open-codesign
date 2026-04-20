import { useT } from '@open-codesign/i18n';
import { useEffect, useRef } from 'react';
import { useAgentStream } from '../hooks/useAgentStream';
import { useCodesignStore } from '../store';
import { ChatMessageList } from './chat/ChatMessageList';
import { CommentChipBar } from './chat/CommentChipBar';
import { EmptyState } from './chat/EmptyState';
import { PromptInput, type PromptInputHandle } from './chat/PromptInput';
import { ModelSwitcher } from './ModelSwitcher';

export interface SidebarProps {
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: () => void;
}

/**
 * Sidebar v2 — chat-style conversation pane.
 *
 * Replaces the single-shot prompt box with a chat history backed by the
 * chat_messages SQLite table. See docs/plans/2026-04-20-agentic-sidebar-
 * custom-endpoint-design.md §5 for the full spec. Multi-design switcher
 * stays deferred; the design name + "+" header shows the single current
 * design only.
 */
export function Sidebar({ prompt, setPrompt, onSubmit }: SidebarProps) {
  const t = useT();
  const config = useCodesignStore((s) => s.config);
  const isGenerating = useCodesignStore(
    (s) => s.isGenerating && s.generatingDesignId === s.currentDesignId,
  );
  const cancelGeneration = useCodesignStore((s) => s.cancelGeneration);
  const inputFiles = useCodesignStore((s) => s.inputFiles);
  const referenceUrl = useCodesignStore((s) => s.referenceUrl);
  const setReferenceUrl = useCodesignStore((s) => s.setReferenceUrl);
  const pickInputFiles = useCodesignStore((s) => s.pickInputFiles);
  const removeInputFile = useCodesignStore((s) => s.removeInputFile);
  const pickDesignSystemDirectory = useCodesignStore((s) => s.pickDesignSystemDirectory);
  const clearDesignSystem = useCodesignStore((s) => s.clearDesignSystem);
  const lastUsage = useCodesignStore((s) => s.lastUsage);

  const chatMessages = useCodesignStore((s) => s.chatMessages);
  const chatLoaded = useCodesignStore((s) => s.chatLoaded);
  const streamingAssistantText = useCodesignStore((s) => s.streamingAssistantText);
  const pendingToolCalls = useCodesignStore((s) => s.pendingToolCalls);
  const loadChatForCurrentDesign = useCodesignStore((s) => s.loadChatForCurrentDesign);
  const currentDesignId = useCodesignStore((s) => s.currentDesignId);
  const designs = useCodesignStore((s) => s.designs);
  const sidebarCollapsed = useCodesignStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useCodesignStore((s) => s.setSidebarCollapsed);

  // Mount useAgentStream here so streaming events route into the chat
  // as soon as the Sidebar is in the tree — matches the lifecycle of
  // chat visibility without needing an app-level hook.
  useAgentStream();

  const promptInputRef = useRef<PromptInputHandle>(null);
  const handlePickStarter = (starterPrompt: string): void => {
    setPrompt(starterPrompt);
    promptInputRef.current?.focus();
  };

  const designSystem = config?.designSystem ?? null;
  const currentDesign = designs.find((d) => d.id === currentDesignId) ?? null;

  useEffect(() => {
    if (currentDesignId && !chatLoaded) {
      void loadChatForCurrentDesign();
    }
  }, [currentDesignId, chatLoaded, loadChatForCurrentDesign]);

  const activeModelLine =
    config?.hasKey && config.modelPrimary ? config.modelPrimary : t('sidebar.chat.noModel');
  const lastTokens = lastUsage ? lastUsage.inputTokens + lastUsage.outputTokens : null;

  return (
    <aside
      className="flex flex-col h-full overflow-x-hidden border-r border-[var(--color-border)] bg-[var(--color-background-secondary)]"
      style={{ minHeight: 0, minWidth: 0 }}
      aria-label={t('sidebar.ariaLabel')}
    >
      {/* Header — clean, no collapse */}
      <div className="h-[var(--space-3)] shrink-0" />

      <>
          {/* Chat scroll area */}
          <div className="flex-1 overflow-y-auto px-[var(--space-4)] py-[var(--space-4)]">
            <ChatMessageList
              messages={chatMessages}
              loading={!chatLoaded}
              isGenerating={isGenerating}
              pendingToolCalls={pendingToolCalls}
              streamingText={
                streamingAssistantText && streamingAssistantText.designId === currentDesignId
                  ? streamingAssistantText.text
                  : null
              }
              empty={<EmptyState onPickStarter={handlePickStarter} />}
            />
          </div>

          {/* Skill chips + prompt input + model/tokens line */}
          <div className="border-t border-[var(--color-border-subtle)] px-[var(--space-4)] pt-[var(--space-3)] pb-[var(--space-3)] space-y-[10px] bg-[var(--color-background-secondary)]">
            <CommentChipBar />
            <PromptInput
              ref={promptInputRef}
              prompt={prompt}
              setPrompt={setPrompt}
              onSubmit={onSubmit}
              onCancel={cancelGeneration}
              isGenerating={isGenerating}
            />
            <div className="flex items-center justify-between gap-[var(--space-2)] px-[2px]">
              <ModelSwitcher variant="sidebar" />
              {lastTokens !== null ? (
                <span
                  className="shrink-0 tabular-nums text-[10.5px] text-[var(--color-text-muted)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {t('sidebar.chat.tokensLine', { count: lastTokens })}
                </span>
              ) : null}
            </div>
          </div>
        </>
    </aside>
  );
}
