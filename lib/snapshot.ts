import { MARKER, type JsonValue, type TruncationCounts } from './protocol';

/**
 * Turns arbitrary page data into a JSON-safe tree without throwing, without
 * touching `toJSON()`, and without ever transferring buffers away from the page.
 *
 * `postMessage` already cloned the data before we see it, so functions and DOM
 * nodes can only appear when the *sender* posted a plain object that contains
 * them — and even then we must not let them break the capture pipeline.
 */

export interface SnapshotOptions {
  maxDepth?: number;
  maxKeys?: number;
  maxItems?: number;
  maxString?: number;
  maxNodes?: number;
}

export interface SnapshotResult {
  value: JsonValue;
  truncated: TruncationCounts;
}

const DEFAULTS: Required<SnapshotOptions> = {
  maxDepth: 6,
  maxKeys: 100,
  maxItems: 100,
  maxString: 10_000,
  maxNodes: 2_000,
};

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/** UTF-8 byte length of a string; used for the `size` column. */
export function byteLength(text: string): number {
  if (encoder) return encoder.encode(text).length;
  // Fallback for exotic runtimes: every code unit is at least one byte.
  return text.length;
}

function emptyCounts(): TruncationCounts {
  return { depth: 0, keys: 0, items: 0, strings: 0, nodes: 0 };
}

function hexSample(bytes: Uint8Array, limit = 24): string {
  const slice = Array.from(bytes.subarray(0, limit), (byte) => byte.toString(16).padStart(2, '0'));
  return (slice.join(' ') + (bytes.length > limit ? ' …' : '')).trim();
}

function objectTag(value: object): string {
  try {
    return Object.prototype.toString.call(value).slice(8, -1);
  } catch {
    return 'Object';
  }
}

function safeRead(source: object, key: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: (source as Record<string, unknown>)[key] };
  } catch {
    return { ok: false };
  }
}

export function snapshot(input: unknown, options: SnapshotOptions = {}): SnapshotResult {
  const opts: Required<SnapshotOptions> = { ...DEFAULTS, ...options };
  const truncated = emptyCounts();
  const seen = new WeakMap<object, number>();
  let nodes = 0;
  let nextRef = 0;

  const marker = (type: string, extra: Record<string, JsonValue> = {}): JsonValue => ({
    [MARKER]: type,
    ...extra,
  });

  const walk = (value: unknown, depth: number): JsonValue => {
    nodes += 1;
    if (nodes > opts.maxNodes) {
      truncated.nodes += 1;
      return marker('Truncated', { reason: 'nodes' });
    }

    switch (typeof value) {
      case 'string':
        if (value.length > opts.maxString) {
          truncated.strings += 1;
          return `${value.slice(0, opts.maxString)}…`;
        }
        return value;
      case 'number':
        return Number.isFinite(value) ? value : marker('Number', { value: String(value) });
      case 'boolean':
        return value;
      case 'undefined':
        return marker('Undefined');
      case 'bigint':
        return marker('BigInt', { value: value.toString() });
      case 'symbol':
        return marker('Symbol', { value: String(value.description ?? value) });
      case 'function':
        return marker('Function', { name: value.name || 'anonymous' });
      case 'object':
        break;
      default:
        return marker('Unknown');
    }

    if (value === null) return null;

    const object = value as object;
    const existing = seen.get(object);
    if (existing !== undefined) return marker('Circular', { ref: `#${existing}` });
    if (depth >= opts.maxDepth) {
      truncated.depth += 1;
      return marker('MaxDepth');
    }
    seen.set(object, ++nextRef);

    // DOM and window objects are useful to see, but they are huge.
    if (typeof Node !== 'undefined' && object instanceof Node) {
      const preview = safeRead(object, 'outerHTML');
      return marker('Node', {
        name: object.nodeName,
        id: 'id' in object ? String((object as { id?: unknown }).id ?? '') : '',
        preview:
          typeof preview === 'object' && preview.ok
            ? String(preview.value ?? '').slice(0, 300)
            : '',
      });
    }
    if (typeof Window !== 'undefined' && object instanceof Window) {
      return marker('Window', { name: object.name || '' });
    }

    // `SharedArrayBuffer` is only exposed on cross-origin isolated pages, so it
    // must be probed with `typeof`; `instanceof undefined` would throw.
    const isSharedBuffer =
      typeof SharedArrayBuffer !== 'undefined' && object instanceof SharedArrayBuffer;
    if (object instanceof ArrayBuffer || isSharedBuffer) {
      try {
        return marker('ArrayBuffer', {
          bytes: object.byteLength,
          preview: hexSample(new Uint8Array(object)),
        });
      } catch {
        return marker('ArrayBuffer', { bytes: object.byteLength });
      }
    }
    if (ArrayBuffer.isView(object)) {
      const view = object as ArrayBufferView;
      try {
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        return marker(view.constructor?.name ?? 'TypedArray', {
          bytes: view.byteLength,
          preview: hexSample(bytes),
        });
      } catch {
        return marker(view.constructor?.name ?? 'TypedArray', { bytes: view.byteLength });
      }
    }

    const tag = objectTag(object);
    switch (tag) {
      case 'Date':
        return marker('Date', { value: (object as Date).toISOString() });
      case 'RegExp': {
        const regexp = object as RegExp;
        return marker('RegExp', { source: regexp.source, flags: regexp.flags });
      }
      case 'Error': {
        const error = object as Error;
        return marker('Error', {
          name: error.name,
          message: error.message,
          stack: (error.stack ?? '').slice(0, 800),
        });
      }
      case 'Map': {
        const entries = Array.from((object as Map<unknown, unknown>).entries());
        if (entries.length > opts.maxItems) truncated.items += entries.length - opts.maxItems;
        return marker('Map', {
          size: entries.length,
          entries: entries
            .slice(0, opts.maxItems)
            .map(([key, item]) => [walk(key, depth + 1), walk(item, depth + 1)]),
        });
      }
      case 'Set': {
        const values = Array.from((object as Set<unknown>).values());
        if (values.length > opts.maxItems) truncated.items += values.length - opts.maxItems;
        return marker('Set', {
          size: values.length,
          values: values.slice(0, opts.maxItems).map((item) => walk(item, depth + 1)),
        });
      }
      case 'WeakMap':
      case 'WeakSet':
      case 'WeakRef':
      case 'Promise':
        return marker(tag);
      case 'URL':
        return marker('URL', { value: String(object) });
      case 'URLSearchParams':
        return marker('URLSearchParams', { value: String(object) });
      case 'Blob':
      case 'File': {
        const blob = object as Blob;
        return marker(tag, {
          size: blob.size,
          type: blob.type,
          name: 'name' in blob ? String((blob as File).name) : '',
        });
      }
      case 'MessagePort':
        return marker('MessagePort');
      default:
        break;
    }

    if (Array.isArray(object)) {
      const total = object.length;
      if (total > opts.maxItems) truncated.items += total - opts.maxItems;
      const limit = Math.min(total, opts.maxItems);
      const output: JsonValue[] = [];
      for (let index = 0; index < limit; index += 1) {
        const read = safeRead(object, String(index));
        output.push(read.ok ? walk(read.value, depth + 1) : marker('Unreadable'));
      }
      return output;
    }

    const keys = (() => {
      try {
        return Object.keys(object);
      } catch {
        return [];
      }
    })();
    if (keys.length > opts.maxKeys) truncated.keys += keys.length - opts.maxKeys;

    const output: Record<string, JsonValue> = {};
    for (const key of keys.slice(0, opts.maxKeys)) {
      const read = safeRead(object, key);
      output[key] = read.ok ? walk(read.value, depth + 1) : marker('Unreadable');
    }
    return output;
  };

  return { value: walk(input, 0), truncated };
}

/** True when any budget was hit and the UI should show a truncation hint. */
export function wasTruncated(counts: TruncationCounts): boolean {
  return Object.values(counts).some((count) => count > 0);
}
