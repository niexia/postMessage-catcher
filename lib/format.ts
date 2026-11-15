const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

export function formatClock(ts: number): string {
  if (!Number.isFinite(ts)) return '—';
  const date = new Date(ts);
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
    date.getMilliseconds(),
    3,
  )}`;
}

export function formatDelta(ts: number, previous: number | undefined): string {
  if (previous === undefined) return '';
  const delta = ts - previous;
  if (!Number.isFinite(delta) || delta < 0) return '';
  if (delta < 1000) return `+${Math.round(delta)}ms`;
  return `+${(delta / 1000).toFixed(1)}s`;
}

/** Compact origin label: strips the scheme for same-origin-heavy lists. */
export function shortOrigin(origin: string): string {
  if (!origin) return 'unknown';
  if (origin === 'null') return 'null';
  return origin.replace(/^https?:\/\//, '');
}
