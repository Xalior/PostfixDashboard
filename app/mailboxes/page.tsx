import Link from 'next/link';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { getCurrentUser } from '@/lib/auth/current-user';
import { formatBytes, formatDateTime } from '@/lib/format';
import { listMailboxes } from '@/lib/queries';

export const metadata = { title: 'Mailboxes' };

interface Props {
  searchParams: Promise<{ q?: string; domain?: string }>;
}

export default async function MailboxesPage({ searchParams }: Props) {
  return (
    <AppShell requireAdmin>
      <Inner searchParams={searchParams} />
    </AppShell>
  );
}

async function Inner({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') return null;
  const { q, domain } = await searchParams;

  const rows = await listMailboxes(user, {
    domain: domain?.trim() || undefined,
    search: q?.trim() || undefined,
  });

  return (
    <>
      <PageHeader
        title="Mailboxes"
        icon="bi-person-lines-fill"
        description={domain ? `Mailboxes in ${domain}` : 'All mailboxes you administer.'}
        actions={
          <Link
            href={`/mailboxes/new${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`}
            className="btn btn-primary"
          >
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            New mailbox
          </Link>
        }
      />

      <form className="mb-3" method="get">
        <div className="d-flex gap-2 flex-wrap">
          <div className="input-group" style={{ maxWidth: 360 }}>
            <span className="input-group-text">
              <i className="bi bi-search" aria-hidden="true" />
            </span>
            <input
              type="search"
              name="q"
              className="form-control"
              placeholder="Search mailboxes…"
              defaultValue={q ?? ''}
            />
          </div>
          {domain && <input type="hidden" name="domain" value={domain} />}
        </div>
      </form>

      <div className="card shadow-sm border-0">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Address</th>
                <th>Name</th>
                <th>Domain</th>
                <th>Quota</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-body-secondary py-4">
                    No mailboxes found.
                  </td>
                </tr>
              )}
              {rows.map((m) => (
                <tr key={m.username}>
                  <td>
                    <Link href={`/mailboxes/${encodeURIComponent(m.username)}`} className="fw-semibold">
                      {m.username}
                    </Link>
                  </td>
                  <td>{m.name || '—'}</td>
                  <td>
                    <Link href={`/domains/${encodeURIComponent(m.domain)}`}>{m.domain}</Link>
                  </td>
                  <td>{m.quota > 0 ? formatBytes(m.quota) : '∞'}</td>
                  <td>
                    <StatusPill active={m.active} />
                  </td>
                  <td className="text-body-secondary small">{formatDateTime(m.created)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
