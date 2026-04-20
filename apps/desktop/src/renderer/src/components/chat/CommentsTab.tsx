import { useT } from '@open-codesign/i18n';
import { MessagesSquare } from 'lucide-react';

/**
 * Placeholder for the Comments tab (canvas inline-comment mode is the
 * v0.2.1 target). The layout slot is reserved now so the tab strip in
 * Sidebar v2 renders symmetrically.
 */
export function CommentsTab() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center h-full px-[var(--space-6)] py-[var(--space-8)] text-center gap-[var(--space-3)]">
      <MessagesSquare
        className="w-8 h-8 text-[var(--color-text-muted)]"
        strokeWidth={1.5}
        aria-hidden
      />
      <div className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
        {t('sidebar.comments.title')}
      </div>
      <p className="text-[var(--text-xs)] text-[var(--color-text-muted)] leading-[var(--leading-snug)] max-w-[240px]">
        {t('sidebar.comments.body')}
      </p>
    </div>
  );
}
