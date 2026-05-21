import Link from 'next/link';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { QuotaBar } from '@/components/ui/QuotaBar';
import { StatusPill } from '@/components/ui/StatusPill';
import { getCurrentUser } from '@/lib/auth/current-user';
import { formatBytes } from '@/lib/format';
import { listDomains } from '@/lib/queries';

export const metadata = { title: 'Domains' };

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function DomainsPage({ searchParams }: Props) {
  return (
    <AppShell requireAdmin>
      <Inner searchParams={searchParams} />
    </AppShell>
  );
}

async function Inner({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') return null;
  const { q } = await searchParams;

  const rows = await listDomains(user, q?.trim() || undefined);

  return (
    <>
      <PageHeader
        title="Domains"
        icon="bi-globe2"
        description={user.isSuperadmin ? 'All domains on this server.' : 'Domains you administer.'}
        actions={
          user.isSuperadmin ? (
            <Link href="/domains/new" className="btn btn-primary">
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              New domain
            </Link>
          ) : null
        }
      />

      <form className="mb-3" method="get">
        <div className="input-group" style={{ maxWidth: 360 }}>
          <span className="input-group-text">
            <i className="bi bi-search" aria-hidden="true" />
          </span>
          <input
            type="search"
            name="q"
            className="form-control"
            placeholder="Search domains…"
            defaultValue={q ?? ''}
          />
        </div>
      </form>

      <div className="card shadow-sm border-0">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Description</th>
                <th className="text-end">Mailboxes</th>
                <th className="text-end">Aliases</th>
                <th>Quota</th>
                <th>Status</th>
                <th className="text-end">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-body-secondary py-4">
                    No domains found.
                  </td>
                </tr>
              )}
              {rows.map((d) => (
                <tr key={d.domain}>
                  <td>
                    <Link href={`/domains/${encodeURIComponent(d.domain)}`} className="fw-semibold">
                      {d.domain}
                    </Link>
                    {d.backupmx && (
                      <span className="status-pill status-warn ms-2" title="Backup MX">
                        <i className="bi bi-hdd-network" /> MX
                      </span>
                    )}
                  </td>
                  <td className="text-body-secondary">{d.description || '—'}</td>
                  <td className="text-end">
                    {d.mailboxCount}
                    <span className="text-body-secondary"> / {d.mailboxes || '∞'}</span>
                  </td>
                  <td className="text-end">
                    {d.aliasCount}
                    <span className="text-body-secondary"> / {d.aliases || '∞'}</span>
                  </td>
                  <td>
                    {d.quota > 0 ? (
                      <QuotaBar usedBytes={d.usedQuotaBytes} maxBytes={d.quota} />
                    ) : (
                      <span className="text-body-secondary small">{formatBytes(d.usedQuotaBytes)} / ∞</span>
                    )}
                  </td>
                  <td>
                    <StatusPill active={d.active} />
                  </td>
                  <td className="text-end">
                    <Link
                      href={`/domains/${encodeURIComponent(d.domain)}`}
                      className="btn btn-sm btn-outline-secondary"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
