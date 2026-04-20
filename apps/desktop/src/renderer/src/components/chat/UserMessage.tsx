import { useT } from '@open-codesign/i18n';

interface UserMessageProps {
  text: string;
  attachedSkills?: string[];
}

export function UserMessage({ text, attachedSkills }: UserMessageProps) {
  const t = useT();
  return (
    <div className="space-y-[var(--space-1_5)]">
      <div className="text-[var(--text-xs)] font-semibold text-[var(--color-text-muted)]">
        {t('sidebar.chat.youLabel')}
      </div>
      <div className="text-[var(--text-sm)] leading-[var(--leading-body)] text-[var(--color-text-primary)] whitespace-pre-wrap break-words">
        {text}
      </div>
      {attachedSkills && attachedSkills.length > 0 ? (
        <div className="flex flex-wrap gap-[var(--space-1)]">
          {attachedSkills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center rounded-full border border-[var(--color-border-muted)] bg-[var(--color-surface)] px-[var(--space-2)] py-[var(--space-0_5)] text-[var(--text-2xs)] text-[var(--color-text-muted)]"
            >
              {t(`sidebar.chat.skill.${s}`, { defaultValue: s })}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
