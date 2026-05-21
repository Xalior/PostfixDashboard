import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: string;
}

export function PageHeader({ title, description, actions, icon }: Props) {
  return (
    <div className="d-flex flex-wrap align-items-start justify-content-between mb-4 gap-2">
      <div>
        <h1 className="h3 mb-0">
          {icon && <i className={`bi ${icon} me-2 text-primary`} aria-hidden="true" />}
          {title}
        </h1>
        {description && <p className="text-body-secondary mb-0">{description}</p>}
      </div>
      {actions && <div className="d-flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
