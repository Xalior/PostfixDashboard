import Link from 'next/link';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { db } from '@/lib/db';
import { admin, domainAdmins } from '@/lib/db/schema';
import { formatDateTime } from '@/lib/format';

export const metadata = { title: 'Administrators' };

export default async function AdminsPage() {
  return (
    <AppShell requireSuperadmin>
      <Inner />
    </AppShell>
  );
}

async function Inner() {
  const rows = await db.select().from(admin).orderBy(admin.username);
  const mappings = await db.select().from(domainAdmins);
  const byUser = new Map<string, string[]>();
  for (const m of mappings) {
    if (!byUser.has(m.username)) byUser.set(m.username, []);
    byUser.get(m.username)!.push(m.domain);
  }

  return (
    <>
      <PageHeader
        title="Administrators"
        icon="bi-shield-lock"
        description="Accounts with access to this dashboard."
        actions={
          <Link href="/admins/new" className="btn btn-primary">
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            New admin
          </Link>
        }
      />

      <div className="card shadow-sm border-0">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Domains</th>
                <th>Status</th>
                <th>Created</th>
                <th className="text-end">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-body-secondary py-4">
                    No admins yet — run <code>npm run db:seed</code> to create the first one.
                  </td>
                </tr>
              )}
              {rows.map((a) => {
                const domains = byUser.get(a.username) ?? [];
                const isSuper = a.superadmin === 1 || domains.includes('ALL');
                const scoped = domains.filter((d) => d !== 'ALL');
                return (
                  <tr key={a.username}>
                    <td className="fw-semibold">{a.username}</td>
                    <td>
                      {isSuper ? (
                        <span className="status-pill status-warn">
                          <i className="bi bi-star-fill" /> Superadmin
                        </span>
                      ) : (
                        <span className="status-pill">Domain admin</span>
                      )}
                    </td>
                    <td className="small text-body-secondary">
                      {isSuper ? 'all domains' : scoped.length > 0 ? scoped.join(', ') : '—'}
                    </td>
                    <td>
                      <StatusPill active={a.active === 1} />
                    </td>
                    <td className="text-body-secondary small">{formatDateTime(a.created)}</td>
                    <td className="text-end">
                      <Link
                        href={`/admins/${encodeURIComponent(a.username)}`}
                        className="btn btn-sm btn-outline-secondary"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
