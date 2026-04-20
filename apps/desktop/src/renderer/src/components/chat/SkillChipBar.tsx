import { useT } from '@open-codesign/i18n';
import { type BuiltinSkillId, BUILTIN_SKILLS } from '../../store';

interface SkillChipBarProps {
  attached: BuiltinSkillId[];
  onToggle: (skill: BuiltinSkillId) => void;
  disabled?: boolean;
}

/**
 * Row of toggle chips above the prompt input. Each chip maps to a builtin
 * skill body that the main process prepends to the system prompt on the
 * next turn. Selection is consumed on submit (store.clearAttachedSkills).
 *
 * Deliberately NOT AI-suggested in v0.2 — chips are a fixed set of 4.
 */
export function SkillChipBar({ attached, onToggle, disabled }: SkillChipBarProps) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-[var(--space-1_5)]" role="group" aria-label={t('sidebar.chat.skills.label')}>
      {BUILTIN_SKILLS.map((skill) => {
        const active = attached.includes(skill);
        return (
          <button
            key={skill}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onToggle(skill)}
            className={`inline-flex items-center rounded-full px-[var(--space-2_5)] py-[var(--space-0_5)] text-[var(--text-xs)] border transition-colors duration-[var(--duration-faster)] ${
              active
                ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent)]'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            ⭐ {t(`sidebar.chat.skill.${skill}`, { defaultValue: skill })}
          </button>
        );
      })}
    </div>
  );
}
