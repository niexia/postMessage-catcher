/** Keep the newest `cap` items, dropping the oldest. Pure so it is easy to test. */
export function appendBounded<T>(previous: readonly T[], next: readonly T[], cap: number): T[] {
  if (next.length === 0) return previous.slice();
  if (cap <= 0) return [];
  if (next.length >= cap) return next.slice(next.length - cap);
  const overflow = previous.length + next.length - cap;
  const kept = overflow > 0 ? previous.slice(overflow) : previous.slice();
  return kept.concat(next);
}
