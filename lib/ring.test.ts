import { describe, expect, it } from 'vitest';
import { appendBounded } from './ring';

describe('appendBounded', () => {
  it('appends when under the cap', () => {
    expect(appendBounded([1, 2], [3], 5)).toEqual([1, 2, 3]);
  });

  it('keeps the newest items when over the cap', () => {
    expect(appendBounded([1, 2, 3], [4, 5], 4)).toEqual([2, 3, 4, 5]);
  });

  it('drops the old list when the new batch already fills the cap', () => {
    expect(appendBounded([1, 2, 3], [4, 5, 6, 7], 3)).toEqual([5, 6, 7]);
  });

  it('returns a copy instead of the input array', () => {
    const previous = [1];
    const result = appendBounded(previous, [], 3);
    expect(result).toEqual([1]);
    expect(result).not.toBe(previous);
  });

  it('honours a zero cap', () => {
    expect(appendBounded([1], [2], 0)).toEqual([]);
  });
});
