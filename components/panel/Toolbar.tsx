import { Download, Search, Trash2 } from 'lucide-react';
import type { RefObject } from 'react';
import { cn } from '../../lib/utils';
import { IconButton } from '../ui/IconButton';
import { BUCKETS, BUCKET_LABEL, type DirectionBucket } from './types';

export interface ToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  bucket: DirectionBucket;
  onBucketChange: (bucket: DirectionBucket) => void;
  recording: boolean;
  onToggleRecording: () => void;
  count: number;
  total: number;
  onClear: () => void;
  onExport: () => void;
}

/**
 * One stop-like control, not two. Recording is the only way capture stops;
 * the list stops following the newest row as soon as you scroll away or select
 * a message, so a separate "freeze the view" mode is unnecessary.
 */
function RecordToggle({ recording, onToggle }: { recording: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={recording}
      title={recording ? 'Stop recording this tab' : 'Start recording this tab'}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        recording
          ? 'bg-danger/10 text-danger hover:bg-danger/15'
          : 'text-muted hover:bg-hover hover:text-ink',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          recording ? 'animate-pulse bg-danger' : 'bg-muted',
        )}
      />
      {recording ? 'Recording' : 'Record'}
    </button>
  );
}

export function Toolbar(props: ToolbarProps) {
  const {
    query,
    onQueryChange,
    searchRef,
    bucket,
    onBucketChange,
    recording,
    onToggleRecording,
    count,
    total,
    onClear,
    onExport,
  } = props;

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-line bg-raised px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold">postMessage</span>
        <span className="text-[11px] tabular-nums text-muted">
          {count === total ? total : `${count} / ${total}`}
        </span>
        <RecordToggle recording={recording} onToggle={onToggleRecording} />
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton
            label="Clear captured messages"
            onClick={onClear}
            disabled={total === 0}
            tooltipPlacement="left"
          >
            <Trash2 size={14} />
          </IconButton>
          <IconButton
            label="Export filtered messages as JSON"
            onClick={onExport}
            disabled={count === 0}
            tooltipPlacement="left"
          >
            <Download size={14} />
          </IconButton>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Filter payload, origin or type…  (⌘F)"
            spellCheck={false}
            className="h-7 w-full rounded border border-line bg-surface pl-7 pr-2 text-[11px] text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
        </div>
        <div
          className="flex shrink-0 items-center rounded border border-line bg-surface p-0.5"
          role="group"
          aria-label="Filter by sender"
        >
          {BUCKETS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onBucketChange(item)}
              aria-pressed={bucket === item}
              className={cn(
                'h-6 rounded px-1.5 text-[11px] text-muted transition-colors hover:text-ink',
                bucket === item && 'bg-selected text-ink',
              )}
            >
              {BUCKET_LABEL[item]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
