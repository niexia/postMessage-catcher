import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { labelOf } from '../../lib/describe';
import { formatBytes, formatClock, shortOrigin } from '../../lib/format';
import { isOpaqueOrigin, type CapturedMessage, type SenderKind } from '../../lib/protocol';
import { cn } from '../../lib/utils';

const ROW_HEIGHT = 26;
const OVERSCAN = 8;

const COLUMNS = 'grid-cols-[74px_14px_minmax(0,1fr)_150px_58px]';

function SenderIcon({ kind }: { kind: SenderKind }) {
  const size = 12;
  switch (kind) {
    case 'self':
      return <RotateCcw size={size} />;
    case 'parent':
    case 'top':
      return <ArrowDownLeft size={size} />;
    case 'child':
      return <ArrowUpRight size={size} />;
    default:
      return <ArrowLeftRight size={size} />;
  }
}

export function ColumnHeader() {
  return (
    <div
      className={cn(
        'grid shrink-0 items-center gap-2 border-b border-line bg-surface px-2 py-1 text-[10px] uppercase tracking-wide text-muted',
        COLUMNS,
      )}
    >
      <span>Time</span>
      <span aria-hidden />
      <span>Route</span>
      <span>Type</span>
      <span className="text-right">Size</span>
    </div>
  );
}

interface RowProps {
  entry: CapturedMessage;
  selected: boolean;
  top: number;
  primaryReceiverOrigin: string;
  onSelect: (id: string) => void;
}

function Row({ entry, selected, top, primaryReceiverOrigin, onSelect }: RowProps) {
  const label = labelOf(entry.data);
  const opaque = isOpaqueOrigin(entry.sender.origin);
  const title = `${entry.sender.origin} → ${entry.receiver.origin}\n${label}`;
  // The tab's dominant receiver is implicit; only show it when it differs.
  const showReceiver = entry.receiver.origin !== primaryReceiverOrigin;

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      title={title}
      onClick={() => onSelect(entry.id)}
      style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_HEIGHT }}
      className={cn(
        'grid items-center gap-2 px-2 text-left text-[11px] transition-colors',
        COLUMNS,
        selected ? 'bg-selected text-ink' : 'hover:bg-hover',
      )}
    >
      <span className="tabular-nums text-muted">{formatClock(entry.ts)}</span>
      <span
        className={cn(
          'flex items-center justify-center',
          entry.sender.kind === 'self' ? 'text-outgoing' : 'text-incoming',
        )}
      >
        <SenderIcon kind={entry.sender.kind} />
      </span>
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate">{shortOrigin(entry.sender.origin)}</span>
        {showReceiver ? (
          <>
            <span className="shrink-0 text-muted">→</span>
            <span className="truncate text-muted">{shortOrigin(entry.receiver.origin)}</span>
          </>
        ) : null}
        {opaque ? (
          <span
            className="shrink-0 text-warn"
            title="Opaque sender origin — origin checks cannot identify this sender"
          >
            <TriangleAlert size={11} />
          </span>
        ) : null}
      </span>
      <span className={cn('truncate font-mono', label.startsWith('<') ? 'text-muted' : 'text-ink')}>
        {label}
      </span>
      <span className="text-right tabular-nums text-muted">{formatBytes(entry.size)}</span>
    </button>
  );
}

export interface MessageListProps {
  entries: CapturedMessage[];
  selectedId: string | null;
  primaryReceiverOrigin: string;
  onSelect: (id: string) => void;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
}

export function MessageList({
  entries,
  selectedId,
  primaryReceiverOrigin,
  onSelect,
  follow,
  onFollowChange,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(320);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport(element.clientHeight));
    observer.observe(element);
    setViewport(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !follow) return;
    element.scrollTop = element.scrollHeight;
    setScrollTop(element.scrollTop);
  }, [entries.length, follow]);

  useEffect(() => {
    if (selectedId === null) return;
    const index = entries.findIndex((entry) => entry.id === selectedId);
    const element = containerRef.current;
    if (index < 0 || !element) return;
    const top = index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight;
    }
    setScrollTop(element.scrollTop);
  }, [selectedId, entries]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2;
  const end = Math.min(entries.length, start + visibleCount);
  const slice = entries.slice(start, end);

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Captured messages"
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget;
        setScrollTop(element.scrollTop);
        const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
        if (atBottom !== follow) onFollowChange(atBottom);
      }}
      className="pmc-scroll relative min-h-0 flex-1 overflow-y-auto focus-visible:outline-1 focus-visible:outline-accent"
    >
      <div style={{ height: entries.length * ROW_HEIGHT, position: 'relative' }}>
        {slice.map((entry, index) => (
          <Row
            key={entry.id}
            entry={entry}
            selected={entry.id === selectedId}
            top={(start + index) * ROW_HEIGHT}
            primaryReceiverOrigin={primaryReceiverOrigin}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
