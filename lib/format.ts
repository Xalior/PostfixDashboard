/**
 * Small pure formatters used by server and client components alike.
 * No I/O, no env, safe to import anywhere.
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const e = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const v = bytes / Math.pow(1024, e);
  return `${v.toFixed(digits)} ${BYTE_UNITS[e]}`;
}

export function mbToBytes(mb: number): number {
  return Math.round(mb * 1024 * 1024);
}

export function bytesToMb(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Truncate a comma/newline separated goto list to fit in a table cell. */
export function summariseGoto(goto: string, max = 3): string {
  const items = goto
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} +${items.length - max} more`;
}
