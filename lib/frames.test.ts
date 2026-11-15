import { describe, expect, it } from 'vitest';
import { classifySender, describeSender, findChildFrame, isWindowLike, readUrl } from './frames';

function win(href: string | null, parent: unknown = null, top: unknown = null): Window {
  return {
    location:
      href === null
        ? {
            get href(): string {
              throw new Error('cross-origin');
            },
          }
        : { href },
    parent,
    top,
  } as unknown as Window;
}

interface FakeFrame {
  contentWindow: Window | null;
  src?: string;
  srcdoc?: boolean;
}

function doc(frames: FakeFrame[]): Document {
  return {
    querySelectorAll: () =>
      frames.map((frame) => ({
        contentWindow: frame.contentWindow,
        getAttribute: (name: string) => (name === 'src' ? (frame.src ?? null) : null),
        hasAttribute: (name: string) => (name === 'srcdoc' ? Boolean(frame.srcdoc) : false),
      })),
  } as unknown as Document;
}

describe('readUrl', () => {
  it('reads same-origin URLs and hides cross-origin ones', () => {
    expect(readUrl(win('https://a.test/'))).toBe('https://a.test/');
    expect(readUrl(win(null))).toBeUndefined();
    expect(readUrl(null)).toBeUndefined();
  });
});

describe('classifySender', () => {
  it('recognises self, parent, top and unrelated windows', () => {
    const parentWindow = win('https://parent.test/');
    const topWindow = win('https://top.test/');
    const self = win('https://child.test/', parentWindow, topWindow);

    expect(classifySender(self, self)).toBe('self');
    expect(classifySender(parentWindow, self)).toBe('parent');
    expect(classifySender(topWindow, self)).toBe('top');
    expect(classifySender(win('https://other.test/'), self)).toBe('other');
    expect(classifySender(null, self)).toBe('unknown');
  });
});

describe('findChildFrame', () => {
  it('matches a child by window proxy identity', () => {
    const child = win('https://child.test/');
    const document = doc([{ contentWindow: win('https://nope.test/') }, { contentWindow: child }]);

    expect(findChildFrame(child, document)).not.toBeNull();
    expect(findChildFrame(win('https://nothing.test/'), document)).toBeNull();
    expect(findChildFrame(null, document)).toBeNull();
  });
});

describe('describeSender', () => {
  it('returns the receiving URL for self posts', () => {
    const self = win('https://parent.test/page');
    expect(describeSender({ origin: 'https://parent.test', source: self }, self, doc([]))).toEqual({
      kind: 'self',
      origin: 'https://parent.test',
      url: 'https://parent.test/page',
    });
  });

  it('resolves a child iframe URL against the receiver', () => {
    const child = win('https://iframe.test/frame');
    const self = win('https://parent.test/page');
    const document = doc([{ contentWindow: child, src: '/nested/frame.html' }]);

    expect(
      describeSender({ origin: 'https://iframe.test', source: child }, self, document),
    ).toEqual({
      kind: 'child',
      origin: 'https://iframe.test',
      url: 'https://parent.test/nested/frame.html',
    });
  });

  it('marks srcdoc children', () => {
    const child = win(null);
    const self = win('https://parent.test/page');
    const document = doc([{ contentWindow: child, srcdoc: true }]);

    expect(describeSender({ origin: 'null', source: child }, self, document)).toEqual({
      kind: 'child',
      origin: 'null',
      url: 'about:srcdoc',
    });
  });

  it('keeps the origin but drops an unreadable parent URL', () => {
    const parent = win(null);
    const self = win('https://child.test/', parent, parent);

    expect(
      describeSender({ origin: 'https://parent.test', source: parent }, self, doc([])),
    ).toEqual({
      kind: 'parent',
      origin: 'https://parent.test',
      url: undefined,
    });
  });

  it('reports unknown when the source is null', () => {
    const self = win('https://parent.test/');
    expect(describeSender({ origin: '', source: null }, self, doc([]))).toEqual({
      kind: 'unknown',
      origin: '',
    });
  });

  it('handles frames that cannot be compared', () => {
    const hostile = {
      querySelectorAll: () => [
        {
          get contentWindow(): Window {
            throw new Error('disallowed');
          },
          getAttribute: () => null,
          hasAttribute: () => false,
        },
      ],
    } as unknown as Document;

    expect(findChildFrame(win('https://x.test/'), hostile)).toBeNull();
  });
});

describe('isWindowLike', () => {
  it('recognises the window itself and its ancestors', () => {
    const parentWindow = win('https://parent.test/');
    const self = win('https://child.test/', parentWindow, parentWindow);

    expect(isWindowLike(null, self)).toBe(false);
    expect(isWindowLike(undefined, self)).toBe(false);
    expect(isWindowLike(self, self)).toBe(true);
    expect(isWindowLike(parentWindow, self)).toBe(true);
  });

  it('accepts a window from another realm by structure', () => {
    const self = win('https://child.test/');
    // `instanceof Window` is false for same-origin windows in other realms.
    const otherRealmWindow = { location: { href: 'https://other.test/' } } as unknown as Window;
    expect(isWindowLike(otherRealmWindow, self)).toBe(true);
  });

  it('rejects message ports and primitives', () => {
    const self = win('https://child.test/');
    expect(isWindowLike({ postMessage() {}, start() {} }, self)).toBe(false);
    expect(isWindowLike('window', self)).toBe(false);
    expect(isWindowLike(42, self)).toBe(false);
  });
});
