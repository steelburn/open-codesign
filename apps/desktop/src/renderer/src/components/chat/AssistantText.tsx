import { useT } from '@open-codesign/i18n';

interface AssistantTextProps {
  text: string;
}

/**
 * Plain assistant prose. We intentionally avoid a markdown dependency at
 * this stage — Workstream B's Phase 1 only streams plain text, and the
 * existing chat history fields are plain strings too. A future commit
 * can swap this for marked() when richer output actually arrives.
 */
export function AssistantText({ text }: AssistantTextProps) {
  const t = useT();
  return (
    <div className="space-y-[var(--space-1_5)]">
      <div className="text-[var(--text-xs)] font-semibold text-[var(--color-text-muted)]">
        {t('sidebar.chat.claudeLabel')}
      </div>
      <div className="text-[var(--text-sm)] leading-[var(--leading-body)] text-[var(--color-text-primary)] whitespace-pre-wrap break-words">
        {text}
      </div>
    </div>
  );
}
