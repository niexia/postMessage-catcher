import { describe, expect, it } from 'vitest';
import { describeType, isMarker, labelOf, previewOf, shapeOf } from './describe';
import { MARKER, type JsonValue } from './protocol';

describe('describeType', () => {
  it('uses the conventional discriminator fields', () => {
    expect(describeType({ type: 'auth:ready' })).toBe('auth:ready');
    expect(describeType({ action: 'RESIZE' })).toBe('RESIZE');
    expect(describeType({ event: 'scroll' })).toBe('scroll');
    expect(describeType({ method: 'ping' })).toBe('ping');
    expect(describeType({ kind: 7 })).toBe('7');
  });

  it('prefers `type` over later fields', () => {
    expect(describeType({ action: 'later', type: 'first' })).toBe('first');
  });

  it('returns null when nothing identifies the message', () => {
    expect(describeType({ payload: 1 })).toBeNull();
    expect(describeType([1, 2])).toBeNull();
    expect(describeType('hello')).toBeNull();
    expect(describeType({ [MARKER]: 'Map' })).toBeNull();
    expect(describeType({ type: '   ' })).toBeNull();
  });

  it('truncates very long discriminators', () => {
    const long = 'x'.repeat(80);
    const result = describeType({ type: long });
    expect(result).not.toBeNull();
    expect(result?.endsWith('…')).toBe(true);
    expect(result?.length).toBe(49);
  });
});

describe('isMarker', () => {
  it('recognises marked values only', () => {
    expect(isMarker({ [MARKER]: 'Map' } as JsonValue)).toBe(true);
    expect(isMarker({ [MARKER]: 1 } as unknown as JsonValue)).toBe(false);
    expect(isMarker([] as JsonValue)).toBe(false);
    expect(isMarker(null)).toBe(false);
  });
});

describe('shapeOf and labelOf', () => {
  it('describes containers and markers', () => {
    expect(shapeOf(null)).toBe('null');
    expect(shapeOf([1, 2, 3])).toBe('Array(3)');
    expect(shapeOf({ [MARKER]: 'MessagePort' } as JsonValue)).toBe('MessagePort');
    expect(shapeOf({} as JsonValue)).toBe('Object');
    expect(shapeOf('text')).toBe('string');
  });

  it('falls back to angle-bracket shape labels', () => {
    expect(labelOf({ type: 'ready' })).toBe('ready');
    expect(labelOf([1])).toBe('<Array(1)>');
    expect(labelOf(null)).toBe('<null>');
  });
});

describe('previewOf', () => {
  it('collapses whitespace and truncates', () => {
    expect(previewOf({ a: 1 })).toBe('{"a":1}');
    expect(previewOf({ a: 'x'.repeat(200) }, 10)).toHaveLength(11);
  });

  it('never throws on hostile values', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const preview = previewOf(cyclic as unknown as JsonValue);
    expect(preview).toBe('[object Object]');
  });
});

describe('labelOf with JSON encoded strings', () => {
  it('unwraps the discriminator from a JSON string', () => {
    expect(labelOf('{"type":"command","id":3}')).toBe('command');
    expect(labelOf('{"event":"onStateChange"}')).toBe('onStateChange');
  });

  it('marks JSON strings that have no discriminator', () => {
    expect(labelOf('{"a":1}')).toBe('<JSON Object>');
    expect(labelOf('[1,2,3]')).toBe('<JSON Array(3)>');
  });

  it('leaves plain and broken strings alone', () => {
    expect(labelOf('hello')).toBe('<string>');
    expect(labelOf('{"type":"broken"')).toBe('<string>');
    expect(labelOf('"quoted"')).toBe('<string>');
  });
});
