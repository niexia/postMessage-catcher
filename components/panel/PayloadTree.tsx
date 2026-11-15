import { useState } from 'react';
import { isMarker } from '../../lib/describe';
import { MARKER, type JsonValue } from '../../lib/protocol';

function Primitive({ value }: { value: JsonValue }) {
  if (value === null) return <span className="text-muted">null</span>;
  if (typeof value === 'string')
    return <span className="break-all text-string">{`"${value}"`}</span>;
  if (typeof value === 'number') return <span className="text-number">{String(value)}</span>;
  if (typeof value === 'boolean') return <span className="text-boolean">{String(value)}</span>;
  return <span className="text-muted">{String(value)}</span>;
}

function Marker({ value }: { value: JsonValue }) {
  const record = value as Record<string, JsonValue>;
  const type = String(record[MARKER]);
  const extras = Object.entries(record)
    .filter(([key]) => key !== MARKER)
    .slice(0, 3)
    .map(([key, item]) => `${key}=${JSON.stringify(item)}`)
    .join(' ');

  return (
    <span>
      <span className="text-boolean">{`<${type}>`}</span>
      {extras ? <span className="text-muted"> {extras}</span> : null}
    </span>
  );
}

function Node({ label, value, depth }: { label?: string; value: JsonValue; depth: number }) {
  const container =
    !isMarker(value) && (Array.isArray(value) || (typeof value === 'object' && value !== null));
  const [open, setOpen] = useState(depth < 2);

  if (!container) {
    return (
      <div className="flex items-start gap-1" style={{ paddingLeft: depth * 12 }}>
        {label !== undefined ? <span className="shrink-0 text-key">{label}:</span> : null}
        <span className="min-w-0 break-all">
          {isMarker(value) ? <Marker value={value} /> : <Primitive value={value} />}
        </span>
      </div>
    );
  }

  const array = Array.isArray(value);
  const entries: Array<[string, JsonValue]> = array
    ? (value as JsonValue[]).map((item, index) => [String(index), item])
    : Object.entries(value as Record<string, JsonValue>);
  const summary = array ? `[${entries.length}]` : `{${entries.length}}`;

  return (
    <div>
      <div className="flex items-start gap-1" style={{ paddingLeft: depth * 12 }}>
        {label !== undefined ? <span className="shrink-0 text-key">{label}:</span> : null}
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded px-0.5 hover:bg-hover focus-visible:outline-1 focus-visible:outline-accent"
        >
          <span className="w-2 shrink-0 text-muted">{open ? '▾' : '▸'}</span>
          <span className="text-muted">{summary}</span>
        </button>
      </div>
      {open
        ? entries.map(([key, item]) => (
            <Node key={key} label={key} value={item} depth={depth + 1} />
          ))
        : null}
    </div>
  );
}

export function PayloadTree({ value }: { value: JsonValue }) {
  return (
    <div className="p-2 font-mono text-[11px] leading-[1.6]">
      <Node value={value} depth={0} />
    </div>
  );
}
