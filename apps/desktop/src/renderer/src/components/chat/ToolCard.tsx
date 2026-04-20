import { useT } from '@open-codesign/i18n';
import { ChevronDown, ListChecks, Zap } from 'lucide-react';
import { useState } from 'react';

export type ToolCardVariant = 'writing' | 'editing' | 'reading' | 'skill' | 'todos' | 'done';
export type ToolCardStatus = 'running' | 'done' | 'error';

export interface ToolCardTodo {
  text: string;
  checked: boolean;
}

export interface ToolCardProps {
  variant: ToolCardVariant;
  status: ToolCardStatus;
  /** Grouping label — e.g. 'Writing', 'Editing'. Rendered as the card title. */
  title: string;
  /** Filenames or skill names — rendered as a compact monospace bullet list. */
  bullets?: string[];
  /** Only used for the 'todos' variant. */
  todos?: ToolCardTodo[];
}

function iconFor(variant: ToolCardVariant) {
  if (variant === 'todos') return ListChecks;
  return Zap;
}

/**
 * One card per verb-group. Default collapsed when status='done' so completed
 * work quiets down; auto-expanded when status='error' so failures are visible
 * without an extra click.
 */
export function ToolCard({ variant, status, title, bullets, todos }: ToolCardProps) {
  const t = useT();
  const initialExpanded = status === 'error' || status === 'running';
  const [expanded, setExpanded] = useState(initialExpanded);

  const Icon = iconFor(variant);
  const showDoneSuffix = status === 'done' && variant !== 'todos' && variant !== 'done';
  const progress =
    variant === 'todos' && todos
      ? `${todos.filter((t) => t.checked).length}/${todos.length}`
      : null;

  return (
    <div
      className={`rounded-[var(--radius-md)] border border-[var(--color-border-muted)] bg-[var(--color-surface)] p-[var(--space-3)] ${
        status === 'error' ? 'border-[var(--color-danger,_#c53030)]' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-[var(--space-2)] text-left"
      >
        <Icon className="w-[14px] h-[14px] text-[var(--color-text-secondary)] shrink-0" />
        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
          {title}
          {showDoneSuffix ? `, ${t('sidebar.chat.tool.done')}` : ''}
          {progress ? ` ${progress}` : ''}
        </span>
        {status === 'running' ? (
          <span
            className="ml-[var(--space-1)] inline-block h-[6px] w-[6px] animate-pulse rounded-full bg-[var(--color-accent)]"
            aria-hidden
          />
        ) : null}
        <ChevronDown
          className={`ml-auto w-[14px] h-[14px] text-[var(--color-text-muted)] transition-transform duration-[var(--duration-faster)] ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="mt-[var(--space-2)] space-y-[var(--space-1)]">
          {variant === 'todos' && todos
            ? todos.map((todo, i) => (
                <div
                  key={`${i}-${todo.text.slice(0, 12)}`}
                  className="flex items-center gap-[var(--space-2)] text-[12.5px] text-[var(--color-text-primary)]"
                >
                  <span
                    className={`inline-block h-[12px] w-[12px] rounded-[2px] border ${
                      todo.checked
                        ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
                        : 'border-[var(--color-border)]'
                    }`}
                    aria-hidden
                  />
                  <span className={todo.checked ? 'line-through text-[var(--color-text-muted)]' : ''}>
                    {todo.text}
                  </span>
                </div>
              ))
            : null}

          {variant !== 'todos' && bullets && bullets.length > 0
            ? bullets.map((b, i) => (
                <div
                  key={`${i}-${b.slice(0, 12)}`}
                  className="text-[12.5px] font-[ui-monospace,Menlo,monospace] text-[var(--color-text-secondary)] truncate"
                  title={b}
                >
                  • {b}
                </div>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
