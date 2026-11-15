import { useMemo, useState } from 'react';
import { parseJsonString } from '../../lib/json-string';
import type { JsonValue } from '../../lib/protocol';
import { cn } from '../../lib/utils';
import { PayloadTree } from './PayloadTree';

type Mode = 'parsed' | 'text';

const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'parsed', label: 'Parsed' },
  { id: 'text', label: 'Text' },
];

/**
 * Payload tab content. When the message body is a JSON *string* (a very common
 * widget/SDK pattern), it is parsed into the same tree view the Network panel
 * uses, with a one-click switch back to the original text.
 */
export function PayloadPane({ data }: { data: JsonValue }) {
  const parsed = useMemo(() => parseJsonString(data), [data]);
  const [mode, setMode] = useState<Mode>(parsed ? 'parsed' : 'text');

  if (!parsed) {
    return (
      <div className="pmc-scroll min-h-0 flex-1 overflow-auto">
        <PayloadTree value={data} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-raised px-2 py-1">
        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
          JSON string
        </span>
        <span className="min-w-0 truncate text-[10px] text-muted">
          {parsed.text.length} chars · parsed for reading
        </span>
        <div className="ml-auto flex shrink-0 items-center rounded border border-line bg-surface p-0.5">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              aria-pressed={mode === option.id}
              className={cn(
                'h-5 rounded px-1.5 text-[10px] text-muted transition-colors hover:text-ink',
                mode === option.id && 'bg-selected text-ink',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pmc-scroll min-h-0 flex-1 overflow-auto">
        {mode === 'parsed' ? (
          <PayloadTree value={parsed.value} />
        ) : (
          <pre className="whitespace-pre-wrap break-all p-2 font-mono text-[11px] leading-[1.6]">
            {parsed.text}
          </pre>
        )}
      </div>
    </div>
  );
}
