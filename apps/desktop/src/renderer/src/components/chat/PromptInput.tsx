import { useT } from '@open-codesign/i18n';
import { IconButton, Tooltip } from '@open-codesign/ui';
import { ArrowUp, Square } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useEffect, useRef } from 'react';

const MAX_TEXTAREA_ROWS = 6;

export function getTextareaLineHeight(el: HTMLTextAreaElement): number {
  const styles = getComputedStyle(el);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
  const fontSize = Number.parseFloat(styles.fontSize);
  const leading = Number.parseFloat(styles.getPropertyValue('--leading-body'));
  if (!Number.isFinite(fontSize) || fontSize <= 0 || !Number.isFinite(leading) || leading <= 0) {
    throw new Error('Textarea sizing tokens (--leading-body / fontSize) are missing or invalid');
  }
  return fontSize * leading;
}

function resizeTextarea(el: HTMLTextAreaElement): void {
  const rowHeight = getTextareaLineHeight(el);
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, rowHeight * MAX_TEXTAREA_ROWS)}px`;
}

export interface PromptInputProps {
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isGenerating: boolean;
}

/**
 * Prompt textarea + send/stop button. Extracted from Sidebar.tsx so the
 * chat pane can be rewritten without disturbing the send-path keybindings.
 *
 * Keybindings:
 *   Enter           — submit (unless Shift/Meta/Ctrl held)
 *   Meta/Ctrl+Enter — submit (power-user muscle memory)
 *   Shift+Enter     — newline
 */
export function PromptInput({ prompt, setPrompt, onSubmit, onCancel, isGenerating }: PromptInputProps) {
  const t = useT();
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (taRef.current) resizeTextarea(taRef.current);
  }, []);

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onSubmit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    const isSendCombo =
      (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) ||
      (e.key === 'Enter' && (e.metaKey || e.ctrlKey));
    if (isSendCombo) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const canSend = prompt.trim().length > 0 && !isGenerating;
  const sendDisabledReason = isGenerating
    ? t('disabledReason.generatingInProgress')
    : t('disabledReason.typePromptToSend');

  return (
    <form onSubmit={handleSubmit}>
      <div className="relative rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:shadow-[0_0_0_3px_var(--color-focus-ring)] transition-[box-shadow,border-color] duration-[var(--duration-faster)] ease-[var(--ease-out)]">
        <textarea
          ref={taRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            resizeTextarea(e.currentTarget);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.placeholderRich')}
          disabled={isGenerating}
          rows={1}
          className="block w-full resize-none bg-transparent px-[var(--space-3)] pt-[var(--space-3)] pb-[calc(var(--space-6)+var(--space-4))] text-[var(--text-sm)] leading-[var(--leading-body)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none min-h-[var(--space-6)] overflow-y-auto"
        />

        <div className="absolute bottom-[var(--space-2)] right-[var(--space-2)]">
          {isGenerating ? (
            <IconButton
              size="sm"
              label={t('chat.stop')}
              onClick={onCancel}
              className="bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] hover:text-[var(--color-on-accent)] hover:scale-[var(--scale-hover-up)] active:scale-[var(--scale-press-down)] transition-[transform,background-color,color] duration-[var(--duration-faster)] ease-[var(--ease-out)]"
            >
              <Square
                className="w-[var(--size-icon-md)] h-[var(--size-icon-md)]"
                strokeWidth={0}
                fill="currentColor"
              />
            </IconButton>
          ) : (
            <Tooltip label={!canSend ? sendDisabledReason : undefined} side="top">
              <IconButton
                size="sm"
                type="submit"
                label={t('chat.send')}
                disabled={!canSend}
                className="bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[var(--shadow-soft)] hover:bg-[var(--color-accent-hover)] hover:text-[var(--color-on-accent)] hover:scale-[var(--scale-hover-up)] active:scale-[var(--scale-press-down)] disabled:opacity-30 disabled:hover:scale-100 transition-[transform,background-color,opacity,color] duration-[var(--duration-faster)] ease-[var(--ease-out)]"
              >
                <ArrowUp
                  className="w-[var(--size-icon-md)] h-[var(--size-icon-md)]"
                  strokeWidth={2.4}
                />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </div>
    </form>
  );
}
