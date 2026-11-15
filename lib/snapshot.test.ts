import { describe, expect, it } from 'vitest';
import { MARKER } from './protocol';
import { byteLength, snapshot, wasTruncated } from './snapshot';

type Marked = { [key: string]: unknown };

function marked(value: unknown): Marked {
  return value as Marked;
}

describe('snapshot', () => {
  it('keeps JSON-safe values untouched', () => {
    expect(snapshot({ a: 1, b: 'x', c: true, d: null, e: [1, 2] }).value).toEqual({
      a: 1,
      b: 'x',
      c: true,
      d: null,
      e: [1, 2],
    });
  });

  it('marks values JSON cannot represent', () => {
    const value = snapshot({
      fn: function named() {},
      big: BigInt(10),
      nothing: undefined,
      notANumber: Number.NaN,
      sym: Symbol('s'),
    }).value as Record<string, Marked>;

    expect(marked(value.fn)[MARKER]).toBe('Function');
    expect(marked(value.fn).name).toBe('named');
    expect(marked(value.big)).toEqual({ [MARKER]: 'BigInt', value: '10' });
    expect(marked(value.nothing)[MARKER]).toBe('Undefined');
    expect(marked(value.notANumber)).toEqual({ [MARKER]: 'Number', value: 'NaN' });
    expect(marked(value.sym).value).toBe('s');
  });

  it('breaks cycles instead of throwing', () => {
    const cyclic: Record<string, unknown> = { name: 'root' };
    cyclic.self = cyclic;

    expect(snapshot(cyclic).value).toEqual({
      name: 'root',
      self: { [MARKER]: 'Circular', ref: '#1' },
    });
  });

  it('caps depth and reports truncation', () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 10; index += 1) deep = { next: deep };

    const result = snapshot(deep);
    expect(result.truncated.depth).toBeGreaterThan(0);
    expect(JSON.stringify(result.value)).toContain('MaxDepth');
    expect(wasTruncated(result.truncated)).toBe(true);
  });

  it('caps long strings, wide arrays and wide objects', () => {
    const long = 'x'.repeat(50);
    const result = snapshot(
      {
        long,
        wide: Array.from({ length: 17 }, (_, index) => index),
        keys: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`k${index}`, index])),
      },
      { maxString: 10, maxItems: 5, maxKeys: 5 },
    );

    expect(result.truncated.strings).toBe(1);
    expect(result.truncated.items).toBe(12);
    expect(result.truncated.keys).toBe(12);
    expect((result.value as { long: string }).long).toBe('xxxxxxxxxx…');
    expect((result.value as { wide: unknown[] }).wide).toHaveLength(5);
  });

  it('describes Map, Set, Date, RegExp and Error', () => {
    const value = snapshot({
      map: new Map([['a', 1]]),
      set: new Set([1, 2]),
      date: new Date('2026-01-02T03:04:05.000Z'),
      regexp: /ab+c/gi,
      error: new TypeError('bad'),
    }).value as Record<string, Marked>;

    expect(marked(value.map)).toEqual({ [MARKER]: 'Map', size: 1, entries: [['a', 1]] });
    expect(marked(value.set)).toEqual({ [MARKER]: 'Set', size: 2, values: [1, 2] });
    expect(marked(value.date)).toEqual({ [MARKER]: 'Date', value: '2026-01-02T03:04:05.000Z' });
    expect(marked(value.regexp)).toEqual({ [MARKER]: 'RegExp', source: 'ab+c', flags: 'gi' });
    expect(marked(value.error)[MARKER]).toBe('Error');
    expect(marked(value.error).name).toBe('TypeError');
  });

  it('describes binary data without copying it', () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const typed = new Uint8Array([4, 5, 6]);

    const value = snapshot({ buffer, typed }).value as Record<string, Marked>;
    expect(marked(value.buffer)).toEqual({
      [MARKER]: 'ArrayBuffer',
      bytes: 3,
      preview: '01 02 03',
    });
    expect(marked(value.typed)).toEqual({ [MARKER]: 'Uint8Array', bytes: 3, preview: '04 05 06' });
  });

  it('survives throwing getters', () => {
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, 'boom', {
      enumerable: true,
      get() {
        throw new Error('nope');
      },
    });

    const result = snapshot(hostile);
    expect(marked(result.value).boom).toEqual({ [MARKER]: 'Unreadable' });
  });

  it('stops after the node budget', () => {
    const wide = Array.from({ length: 100 }, (_, index) => ({ index }));
    const result = snapshot(wide, { maxNodes: 10 });
    expect(result.truncated.nodes).toBeGreaterThan(0);
  });

  it('measures UTF-8 byte length', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('é')).toBe(2);
    expect(byteLength('中')).toBe(3);
  });

  it('does not require SharedArrayBuffer to exist', () => {
    // Chrome only exposes SharedArrayBuffer on cross-origin isolated pages;
    // `instanceof` on the missing global used to throw and drop every capture.
    const globals = globalThis as { SharedArrayBuffer?: typeof SharedArrayBuffer };
    const original = globals.SharedArrayBuffer;
    try {
      globals.SharedArrayBuffer = undefined;
      expect(snapshot({ a: 1, buffer: new Uint8Array([1]).buffer }).value).toEqual({
        a: 1,
        buffer: { [MARKER]: 'ArrayBuffer', bytes: 1, preview: '01' },
      });
    } finally {
      globals.SharedArrayBuffer = original;
    }
  });
});
