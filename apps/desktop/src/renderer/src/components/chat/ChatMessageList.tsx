import { useT } from '@open-codesign/i18n';
import type { ChatMessageRow, ChatToolCallPayload } from '@open-codesign/shared';
import { FileText } from 'lucide-react';
import { AssistantText } from './AssistantText';
import { ToolCard, type ToolCardStatus, type ToolCardVariant } from './ToolCard';
import { UserMessage } from './UserMessage';

interface ChatMessageListProps {
  messages: ChatMessageRow[];
  loading: boolean;
  empty?: React.ReactNode;
}

interface RenderItem {
  key: string;
  node: React.ReactNode;
}

function verbGroupOf(call: ChatToolCallPayload): string {
  if (call.verbGroup) return call.verbGroup;
  if (call.toolName === 'set_todos') return 'Progress';
  if (call.toolName === 'load_skill') return 'Invoking skill';
  if (call.command === 'create') return 'Writing';
  if (call.command === 'str_replace' || call.command === 'insert') return 'Editing';
  if (call.command === 'view') return 'Reading';
  return 'Working';
}

function variantFor(call: ChatToolCallPayload): ToolCardVariant {
  if (call.toolName === 'set_todos') return 'todos';
  if (call.toolName === 'load_skill') return 'skill';
  if (call.command === 'create') return 'writing';
  if (call.command === 'str_replace' || call.command === 'insert') return 'editing';
  if (call.command === 'view') return 'reading';
  return 'done';
}

interface Bucket {
  verbGroup: string;
  variant: ToolCardVariant;
  status: ToolCardStatus;
  bullets: string[];
  todos: Array<{ text: string; checked: boolean }> | undefined;
  firstSeq: number;
}

/**
 * Collapses consecutive tool_call rows with the same verbGroup into a single
 * ToolCard. A non-tool_call row or a verbGroup transition flushes the current
 * bucket and starts a new one. Status transitions: if any row in the bucket
 * is 'running' → card renders 'running', if any is 'error' → 'error',
 * otherwise 'done'.
 */
export function ChatMessageList({ messages, loading, empty }: ChatMessageListProps) {
  const t = useT();

  if (loading && messages.length === 0) {
    return (
      <div className="text-[var(--text-sm)] text-[var(--color-text-muted)]">
        {t('common.loading')}
      </div>
    );
  }

  if (messages.length === 0) {
    return <>{empty}</>;
  }

  const items: RenderItem[] = [];
  let bucket: Bucket | null = null;

  const flush = () => {
    if (!bucket) return;
    const cur = bucket;
    items.push({
      key: `tc-${cur.firstSeq}-${cur.verbGroup}`,
      node: (
        <ToolCard
          variant={cur.variant}
          status={cur.status}
          title={cur.verbGroup}
          bullets={cur.bullets}
          {...(cur.todos !== undefined ? { todos: cur.todos } : {})}
        />
      ),
    });
    bucket = null;
  };

  for (const msg of messages) {
    if (msg.kind === 'tool_call') {
      const call = (msg.payload as ChatToolCallPayload) ?? null;
      if (!call) continue;
      const group = verbGroupOf(call);
      const variant = variantFor(call);
      const bullet =
        typeof call.args?.['path'] === 'string'
          ? (call.args['path'] as string)
          : typeof call.args?.['name'] === 'string'
            ? (call.args['name'] as string)
            : call.toolName;

      if (bucket && bucket.verbGroup === group) {
        bucket.bullets.push(bullet);
        if (call.status === 'running') bucket.status = 'running';
        else if (call.status === 'error') bucket.status = 'error';
      } else {
        flush();
        bucket = {
          verbGroup: group,
          variant,
          status: call.status,
          bullets: [bullet],
          todos:
            variant === 'todos' && Array.isArray(call.args?.['items'])
              ? (call.args['items'] as Array<{ text: string; checked: boolean }>)
              : undefined,
          firstSeq: msg.seq,
        };
      }
      continue;
    }

    flush();

    if (msg.kind === 'user') {
      const p = msg.payload as { text?: string; attachedSkills?: string[] };
      items.push({
        key: `u-${msg.seq}`,
        node: (
          <UserMessage
            text={p?.text ?? ''}
            {...(p?.attachedSkills ? { attachedSkills: p.attachedSkills } : {})}
          />
        ),
      });
    } else if (msg.kind === 'assistant_text') {
      const p = msg.payload as { text?: string };
      items.push({
        key: `a-${msg.seq}`,
        node: <AssistantText text={p?.text ?? ''} />,
      });
    } else if (msg.kind === 'artifact_delivered') {
      const p = msg.payload as { filename?: string; createdAt?: string };
      const label = p?.filename ?? t('sidebar.chat.artifactDefaultLabel');
      items.push({
        key: `art-${msg.seq}`,
        node: (
          <div className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border-muted)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)]">
            <FileText
              className="w-[14px] h-[14px] text-[var(--color-text-secondary)] shrink-0"
              aria-hidden
            />
            <span className="text-[12.5px] font-[ui-monospace,Menlo,monospace] text-[var(--color-text-primary)] truncate">
              {label}
            </span>
            <span className="ml-auto text-[11px] text-[var(--color-text-muted)]">
              {t('sidebar.chat.artifactDelivered')}
            </span>
          </div>
        ),
      });
    } else if (msg.kind === 'error') {
      const p = msg.payload as { message?: string };
      items.push({
        key: `err-${msg.seq}`,
        node: (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-danger,_#c53030)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-xs)] text-[var(--color-text-primary)]">
            {p?.message ?? t('errors.unknown')}
          </div>
        ),
      });
    }
  }

  flush();

  return (
    <div className="space-y-[var(--space-4)]">
      {items.map((item) => (
        <div key={item.key}>{item.node}</div>
      ))}
    </div>
  );
}
