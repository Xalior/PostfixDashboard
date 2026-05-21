import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCurrentUser } from '@/lib/auth/current-user';
import { formatDateTime } from '@/lib/format';
import { listLogs } from '@/lib/queries';

export const metadata = { title: 'Audit log' };

export default async function LogsPage() {
  return (
    <AppShell requireAdmin>
      <Inner />
    </AppShell>
  );
}

async function Inner() {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') return null;
  const rows = await listLogs(user, 500);

  return (
    <>
      <PageHeader
        title="Audit log"
        icon="bi-clock-history"
        description={
          user.isSuperadmin
            ? 'Every write action across the dashboard, newest first.'
            : 'Write actions on your domains, newest first.'
        }
      />

      <div className="card shadow-sm border-0">
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-body-secondary py-4">
                    No log entries yet.
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
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
