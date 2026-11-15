import { describe, expect, it } from 'vitest';
import { parseJsonString } from './json-string';

describe('parseJsonString', () => {
  it('parses an object encoded as a string', () => {
    const text = '{"type":"widget","event":"command","args":["onStateChange"],"id":3}';
    const parsed = parseJsonString(text);
    expect(parsed?.kind).toBe('json');
    if (parsed?.kind !== 'json') return;
    expect(parsed.text).toBe(text);
    expect(parsed.value).toEqual({
      type: 'widget',
      event: 'command',
      args: ['onStateChange'],
      id: 3,
    });
  });

  it('parses arrays and ignores surrounding whitespace', () => {
    const parsed = parseJsonString('  [1,2,3]  ');
    expect(parsed?.kind).toBe('json');
    if (parsed?.kind !== 'json') return;
    expect(parsed.value).toEqual([1, 2, 3]);
    expect(parsed.text).toBe('  [1,2,3]  ');
  });

  it('rejects everything that is not a JSON object/array string', () => {
    expect(parseJsonString({ a: 1 })).toBeNull();
    expect(parseJsonString(null)).toBeNull();
    expect(parseJsonString(42)).toBeNull();
    expect(parseJsonString('')).toBeNull();
    expect(parseJsonString('   ')).toBeNull();
    expect(parseJsonString('hello')).toBeNull();
    expect(parseJsonString('123')).toBeNull();
    expect(parseJsonString('"a string"')).toBeNull();
    expect(parseJsonString('null')).toBeNull();
    expect(parseJsonString('true')).toBeNull();
    expect(parseJsonString('{"type":"broken"')).toBeNull();
    expect(parseJsonString('[1,2')).toBeNull();
    expect(parseJsonString('{ not json }')).toBeNull();
  });

  it('rejects a leading JSON-looking character that is not JSON', () => {
    expect(parseJsonString('{hello}')).toBeNull();
    expect(parseJsonString('[oops]')).toBeNull();
  });
});
