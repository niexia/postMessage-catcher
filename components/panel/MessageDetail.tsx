import { Copy, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { copyText, prettyJson } from '../../lib/clipboard';
import { isMarker } from '../../lib/describe';
import { formatBytes, formatClock } from '../../lib/format';
import { MARKER, isOpaqueOrigin, type CapturedMessage } from '../../lib/protocol';
import { cn } from '../../lib/utils';
import { IconButton } from '../ui/IconButton';
import { PayloadTree } from './PayloadTree';
import { directionLabel } from './types';

export type DetailTab = 'overview' | 'payload' | 'raw';

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'payload', label: 'Payload' },
  { id: 'raw', label: 'Raw' },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 px-3 py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </div>
  );
}

function warningsFor(entry: CapturedMessage): string[] {
  const warnings: string[] = [];
  if (isOpaqueOrigin(entry.sender.origin)) {
    warnings.push(
      'The sender origin is opaque ("null"). Origin checks cannot tell these senders apart — treat the message as untrusted.',
    );
  }
  if (!entry.sender.url) {
    warnings.push(
      'The sender URL is not readable, either because it is cross-origin or because the sender is not a window (for example a MessagePort).',
    );
  }
  if (entry.truncated) {
    const parts = Object.entries(entry.truncated)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${count} ${key}`);
    if (parts.length > 0) {
      warnings.push(
        `The payload was truncated at capture time to keep the page responsive (${parts.join(', ')}).`,
      );
    }
  }
  if (isMarker(entry.data) && entry.data[MARKER] === 'Oversize') {
    warnings.push(
      'The payload exceeded the 512 KB capture budget and was replaced by a size marker.',
    );
  }
  return warnings;
}

function Overview({ entry }: { entry: CapturedMessage }) {
  const warnings = warningsFor(entry);
  const truncated = entry.truncated
    ? Object.entries(entry.truncated)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${key}: ${count}`)
        .join(', ')
    : '—';

  return (
    <div className="py-2">
      <dl className="font-mono text-[11px]">
        <Field label="Time">
          <span className="tabular-nums">{formatClock(entry.ts)}</span>
          <span className="ml-2 text-muted">{new Date(entry.ts).toISOString()}</span>
        </Field>
        <Field label="Direction">{directionLabel(entry.sender.kind)}</Field>
        <Field label="Sender origin">
          <span className={cn(isOpaqueOrigin(entry.sender.origin) && 'text-warn')}>
            {entry.sender.origin || '—'}
          </span>
        </Field>
        <Field label="Sender URL">{entry.sender.url ?? '—'}</Field>
        <Field label="Receiver URL">{entry.receiver.url}</Field>
        <Field label="Receiver origin">{entry.receiver.origin}</Field>
        <Field label="Size">{formatBytes(entry.size)}</Field>
        <Field label="Frame">#{entry.frameId}</Field>
        <Field label="Document">{entry.documentId ?? '—'}</Field>
        <Field label="Sequence">#{entry.seq}</Field>
        <Field label="Truncated">{truncated}</Field>
      </dl>

      {warnings.length > 0 ? (
        <div className="mx-3 mt-2 rounded border border-warn/40 bg-warn/10 p-2">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-warn">
            <TriangleAlert size={12} /> Worth checking
          </div>
          <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export interface MessageDetailProps {
  entry: CapturedMessage | null;
  /** Controlled by the panel so the tab survives selecting another message. */
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
}

export function MessageDetail({ entry, tab, onTabChange }: MessageDetailProps) {
  const [copied, setCopied] = useState(false);

  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[11px] text-muted">
        Select a message to inspect its payload, routing and warnings.
      </div>
    );
  }

  const copy = async () => {
    const ok = await copyText(prettyJson(entry.data));
    setCopied(ok);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-line bg-raised px-2 py-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            aria-pressed={tab === item.id}
            className={cn(
              'h-6 rounded px-2 text-[11px] text-muted transition-colors hover:text-ink',
              tab === item.id && 'bg-selected text-ink',
            )}
          >
            {item.label}
          </button>
        ))}
        <div className="ml-auto">
          <IconButton
            label={copied ? 'Copied' : 'Copy payload as JSON'}
            onClick={copy}
            tooltipPlacement="left"
          >
            <Copy size={13} />
          </IconButton>
        </div>
      </div>

      <div className="pmc-scroll min-h-0 flex-1 overflow-auto">
        {tab === 'overview' ? <Overview entry={entry} /> : null}
        {tab === 'payload' ? <PayloadTree value={entry.data} /> : null}
        {tab === 'raw' ? (
          <pre className="whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-[1.6]">
            {prettyJson(entry.data)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
