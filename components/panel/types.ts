import type { SenderKind } from '../../lib/protocol';

export type DirectionBucket = 'all' | 'self' | 'parent' | 'child' | 'other';

export const BUCKETS: readonly DirectionBucket[] = ['all', 'self', 'parent', 'child', 'other'];

export const BUCKET_LABEL: Record<DirectionBucket, string> = {
  all: 'All',
  self: 'Self',
  parent: 'Parent',
  child: 'Child',
  other: 'Other',
};

export function bucketOf(kind: SenderKind): Exclude<DirectionBucket, 'all'> {
  if (kind === 'self') return 'self';
  if (kind === 'parent' || kind === 'top') return 'parent';
  if (kind === 'child') return 'child';
  return 'other';
}

export function directionLabel(kind: SenderKind): string {
  switch (kind) {
    case 'self':
      return 'Posted to itself';
    case 'parent':
      return 'From the parent frame';
    case 'top':
      return 'From the top frame';
    case 'child':
      return 'From a child frame';
    case 'other':
      return 'From another window';
    default:
      return 'Unknown sender';
  }
}
