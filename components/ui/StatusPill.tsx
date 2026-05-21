import type { ReactNode } from 'react';

interface Props {
  active: boolean;
  labelActive?: string;
  labelInactive?: string;
  icon?: ReactNode;
}

export function StatusPill({
  active,
  labelActive = 'Active',
  labelInactive = 'Disabled',
  icon,
}: Props) {
  return (
    <span className={`status-pill ${active ? 'status-active' : 'status-inactive'}`}>
      {icon ?? <i className={`bi ${active ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`} />}
      {active ? labelActive : labelInactive}
    </span>
  );
}
