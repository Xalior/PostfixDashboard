import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/AppShell';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { QuotaBar } from '@/components/ui/QuotaBar';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  deleteDomainAction,
  toggleDomainActiveAction,
} from '@/lib/actions/domain';
import { getCurrentUser } from '@/lib/auth/current-user';
import { formatBytes, formatDateTime } from '@/lib/format';
import {
  getDomain,
  listAliases,
  listMailboxes,
} from '@/lib/queries';

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { domain } = await params;
  return { title: decodeURIComponent(domain) };
}

export default async function DomainDetailPage({ params }: Props) {
  return (
    <AppShell requireAdmin>
      <Inner params={params} />
    </AppShell>
  );
}

async function Inner({ params }: Props) {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') return null;
  const { domain: raw } = await params;
  const name = decodeURIComponent(raw);

  const d = await getDomain(user, name);
  if (!d) notFound();

  const [mailboxes, aliases] = await Promise.all([
    listMailboxes(user, { domain: name }),
    listAliases(user, { domain: name }),
  ]);

  const usedBytes = mailboxes.reduce((acc, m) => acc + m.quota, 0);
  const quotaBytes = Number(d.quota);

  const deleteBound = deleteDomainAction.bind(null, name);
  const toggleBound = toggleDomainActiveAction.bind(null, name);

  return (
    <>
      <PageHeader
        title={d.domain}
        icon="bi-globe2"
        description={d.description || 'No description set.'}
        actions={
          <>
            <Link href={`/mailboxes/new?domain=${encodeURIComponent(name)}`} className="btn btn-primary">
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              New mailbox
            </Link>
            <Link href={`/aliases/new?domain=${encodeURIComponent(name)}`} className="btn btn-outline-primary">
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />
              New alias
            </Link>
            <Link href={`/domains/${encodeURIComponent(name)}/edit`} className="btn btn-outline-secondary">
              <i className="bi bi-pencil me-1" aria-hidden="true" />
              Edit
            </Link>
            {user.isSuperadmin && (
              <>
                <form action={toggleBound}>
                  <button type="submit" className="btn btn-outline-secondary">
                    <i className="bi bi-toggle-on me-1" aria-hidden="true" />
                    {d.active === 1 ? 'Disable' : 'Enable'}
                  </button>
                </form>
                <ConfirmButton
                  label="Delete"
                  action={deleteBound}
                  title={`Delete ${d.domain}?`}
                  body={`This will permanently delete the domain "${d.domain}" along with all ${mailboxes.length} mailbox(es) and ${aliases.length} alias(es). This cannot be undone.`}
                />
              </>
            )}
          </>
        }
      />

      <div className="row g-3 mb-4">
        <StatCard label="Status" value={<StatusPill active={d.active === 1} />} />
        <StatCard
          label="Mailboxes"
          value={`${mailboxes.length} / ${d.mailboxes || '∞'}`}
        />
        <StatCard label="Aliases" value={`${aliases.length} / ${d.aliases || '∞'}`} />
        <StatCard
          label="Quota"
          value={
            quotaBytes > 0 ? (
              <QuotaBar usedBytes={usedBytes} maxBytes={quotaBytes} compact />
            ) : (
              <span>{formatBytes(usedBytes)} / ∞</span>
            )
          }
        />
      </div>

      <div className="row g-4">
        <div className="col-lg-7">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-transparent d-flex align-items-center justify-content-between">
              <h2 className="h6 mb-0">Mailboxes</h2>
              <Link href={`/mailboxes?domain=${encodeURIComponent(name)}`} className="small">
                View all
              </Link>
            </div>
            <div className="table-responsive">
              <table className="table mb-0 align-middle">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Name</th>
                    <th>Quota</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mailboxes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-body-secondary py-3">
                        No mailboxes in this domain yet.
                      </td>
                    </tr>
                  )}
                  {mailboxes.slice(0, 10).map((m) => (
                    <tr key={m.username}>
                      <td>
                        <Link href={`/mailboxes/${encodeURIComponent(m.username)}`}>{m.username}</Link>
                      </td>
                      <td>{m.name || '—'}</td>
                      <td>{m.quota > 0 ? formatBytes(m.quota) : '∞'}</td>
                      <td>
                        <StatusPill active={m.active} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-transparent d-flex align-items-center justify-content-between">
              <h2 className="h6 mb-0">Aliases</h2>
              <Link href={`/aliases?domain=${encodeURIComponent(name)}`} className="small">
                View all
              </Link>
            </div>
            <div className="table-responsive">
              <table className="table mb-0 align-middle">
                <thead>
                  <tr>
                    <th>Alias</th>
                    <th>Goes to</th>
                  </tr>
                </thead>
                <tbody>
                  {aliases.length === 0 && (
                    <tr>
                      <td colSpan={2} className="text-center text-body-secondary py-3">
                        No standalone aliases yet.
                      </td>
                    </tr>
                  )}
                  {aliases.slice(0, 10).map((a) => (
                    <tr key={a.address}>
                      <td>
                        <Link href={`/aliases/${encodeURIComponent(a.address)}/edit`}>
                          {a.address}
                        </Link>
                      </td>
                      <td className="small text-body-secondary">{a.goto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 text-body-secondary small">
        Created {formatDateTime(d.created)} · last modified {formatDateTime(d.modified)}
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="col-6 col-lg-3">
      <div className="card h-100 shadow-sm border-0">
        <div className="card-body">
          <div className="small text-body-secondary text-uppercase">{label}</div>
          <div className="fs-5 fw-semibold">{value}</div>
        </div>
      </div>
    </div>
  );
}
