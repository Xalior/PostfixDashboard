import Link from 'next/link';

import { AppShell } from '@/components/layout/AppShell';
import { getCurrentUser } from '@/lib/auth/current-user';
import { dashboardStats, listLogs } from '@/lib/queries';
import { formatBytes, formatDateTime } from '@/lib/format';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  return (
    <AppShell requireAdmin>
      <DashboardInner />
    </AppShell>
  );
}

async function DashboardInner() {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') return null;

  const stats = await dashboardStats(user);
  const recent = await listLogs(user, 8);

  const cards = [
    {
      label: 'Domains',
      value: stats.domains,
      href: '/domains',
      icon: 'bi-globe2',
      variant: 'primary',
    },
    {
      label: 'Mailboxes',
      value: stats.mailboxes,
      href: '/mailboxes',
      icon: 'bi-person-lines-fill',
      variant: 'success',
    },
    {
      label: 'Aliases',
      value: stats.aliases,
      href: '/aliases',
      icon: 'bi-arrow-left-right',
      variant: 'info',
    },
    {
      label: 'Allocated quota',
      value: formatBytes(stats.allocatedQuotaBytes),
      href: '/mailboxes',
      icon: 'bi-hdd-stack',
      variant: 'warning',
    },
  ];

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between mb-4 gap-2">
        <div>
          <h1 className="h3 mb-0">Dashboard</h1>
          <p className="text-body-secondary mb-0">
            Welcome back, <strong>{user.username}</strong>
            {user.isSuperadmin ? ' · superadmin' : ''}
          </p>
        </div>
        {user.isSuperadmin && (
          <div className="d-flex gap-2">
            <Link href="/domains/new" className="btn btn-primary">
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              Add domain
            </Link>
          </div>
        )}
      </div>

      <div className="row g-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className="col-6 col-lg-3">
            <Link href={c.href} className="text-decoration-none">
              <div className="card h-100 shadow-sm border-0">
                <div className="card-body d-flex align-items-start justify-content-between">
                  <div>
                    <div className="text-body-secondary small text-uppercase">{c.label}</div>
                    <div className="fs-3 fw-semibold">{c.value}</div>
                  </div>
                  <div className={`text-${c.variant} fs-2`}>
                    <i className={`bi ${c.icon}`} aria-hidden="true" />
                  </div>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>

      <div className="card shadow-sm border-0">
        <div className="card-header bg-transparent d-flex align-items-center justify-content-between">
          <h2 className="h6 mb-0">Recent activity</h2>
          <Link href="/logs" className="small">
            View all
          </Link>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Domain</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-body-secondary py-4">
                    No activity recorded yet.
                  </td>
                </tr>
              )}
              {recent.map((row, i) => (
                <tr key={`${row.timestamp.toString()}-${i}`}>
                  <td className="text-nowrap">{formatDateTime(row.timestamp)}</td>
                  <td>{row.username}</td>
                  <td>{row.domain || '—'}</td>
                  <td>
                    <code className="small">{row.action}</code>
                  </td>
                  <td className="text-body-secondary small">{row.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
