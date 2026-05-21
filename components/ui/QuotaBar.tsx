import { formatBytes } from '@/lib/format';

interface Props {
  usedBytes: number;
  maxBytes: number;
  compact?: boolean;
}

export function QuotaBar({ usedBytes, maxBytes, compact = false }: Props) {
  if (maxBytes <= 0) {
    return (
      <div className="quota-cell">
        <div className="small text-body-secondary">{formatBytes(usedBytes)} / ∞</div>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((usedBytes / maxBytes) * 100));
  const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
  return (
    <div className="quota-cell">
      {!compact && (
        <div className="small text-body-secondary">
          {formatBytes(usedBytes)} / {formatBytes(maxBytes)} ({pct}%)
        </div>
      )}
      <div className={`quota-bar ${cls}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
