import { describe, expect, it } from 'vitest';
import {
  isOpaqueOrigin,
  isOwnExtensionMessage,
  isPanelOutbound,
  isRuntimeRequest,
  type JsonValue,
} from './protocol';

describe('isOwnExtensionMessage', () => {
  it('matches messages namespaced by the extension id', () => {
    const id = 'abcdefghijklmnop';
    expect(isOwnExtensionMessage({ type: `${id}:wxt:content-script-started` }, id)).toBe(true);
    expect(isOwnExtensionMessage({ type: `${id}:anything` }, id)).toBe(true);
  });

  it('ignores page traffic', () => {
    const id = 'abcdefghijklmnop';
    expect(isOwnExtensionMessage({ type: 'page:ready' }, id)).toBe(false);
    expect(isOwnExtensionMessage({ type: 42 }, id)).toBe(false);
    expect(isOwnExtensionMessage([1, 2] as JsonValue, id)).toBe(false);
    expect(isOwnExtensionMessage(null, id)).toBe(false);
    expect(isOwnExtensionMessage({ type: `${id}:x` }, '')).toBe(false);
  });
});

describe('isOpaqueOrigin', () => {
  it('flags null and empty origins', () => {
    expect(isOpaqueOrigin('null')).toBe(true);
    expect(isOpaqueOrigin('')).toBe(true);
    expect(isOpaqueOrigin('https://example.test')).toBe(false);
  });
});

describe('isRuntimeRequest', () => {
  it('accepts the known request shapes', () => {
    expect(isRuntimeRequest({ type: 'pmc:hello' })).toBe(true);
    expect(isRuntimeRequest({ type: 'pmc:batch', entries: [] })).toBe(true);
    expect(isRuntimeRequest({ type: 'pmc:set-recording', tabId: 1, enabled: false })).toBe(true);
    expect(isRuntimeRequest({ type: 'pmc:get-state', tabId: 1 })).toBe(true);
    expect(isRuntimeRequest({ type: 'pmc:clear', tabId: 1 })).toBe(true);
  });

  it('rejects malformed requests', () => {
    expect(isRuntimeRequest(null)).toBe(false);
    expect(isRuntimeRequest({ type: 'other' })).toBe(false);
    expect(isRuntimeRequest({ type: 'pmc:batch' })).toBe(false);
    expect(isRuntimeRequest({ type: 'pmc:set-recording', tabId: '1', enabled: true })).toBe(false);
    expect(isRuntimeRequest({ type: 'pmc:clear' })).toBe(false);
  });
});

describe('isPanelOutbound', () => {
  it('accepts panel commands only', () => {
    expect(isPanelOutbound({ type: 'subscribe', tabId: 1 })).toBe(true);
    expect(isPanelOutbound({ type: 'clear', tabId: 1 })).toBe(true);
    expect(isPanelOutbound({ type: 'set-recording', tabId: 1, enabled: true })).toBe(true);
    expect(isPanelOutbound({ type: 'entries', entries: [] })).toBe(false);
    expect(isPanelOutbound({ type: 'subscribe' })).toBe(false);
  });
});
