import Link from 'next/link';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { getCurrentUser } from '@/lib/auth/current-user';
import { summariseGoto } from '@/lib/format';
import { listAliases } from '@/lib/queries';

export const metadata = { title: 'Aliases' };

interface Props {
  searchParams: Promise<{ q?: string; domain?: string; all?: string }>;
}

export default async function AliasesPage({ searchParams }: Props) {
  return (
    <AppShell requireAdmin>
      <Inner searchParams={searchParams} />
    </AppShell>
  );
}

async function Inner({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') return null;
  const { q, domain, all } = await searchParams;
  const includeMailbox = all === '1';

  const rows = await listAliases(user, {
    domain: domain?.trim() || undefined,
    search: q?.trim() || undefined,
    includeMailbox,
  });

  return (
    <>
      <PageHeader
        title="Aliases"
        icon="bi-arrow-left-right"
        description={domain ? `Aliases in ${domain}` : 'All aliases you administer.'}
        actions={
          <Link
            href={`/aliases/new${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`}
            className="btn btn-primary"
          >
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            New alias
          </Link>
        }
      />

      <form className="mb-3" method="get">
        <div className="d-flex gap-2 flex-wrap align-items-center">
          <div className="input-group" style={{ maxWidth: 360 }}>
            <span className="input-group-text">
              <i className="bi bi-search" aria-hidden="true" />
            </span>
            <input
              type="search"
              name="q"
              className="form-control"
              placeholder="Search aliases…"
              defaultValue={q ?? ''}
            />
          </div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="all-toggle"
              name="all"
              value="1"
              defaultChecked={includeMailbox}
            />
            <label className="form-check-label small" htmlFor="all-toggle">
              Include mailbox self-aliases
            </label>
          </div>
          {domain && <input type="hidden" name="domain" value={domain} />}
          <button type="submit" className="btn btn-outline-secondary btn-sm">
            Apply
          </button>
        </div>
      </form>

      <div className="card shadow-sm border-0">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Address</th>
                <th>Goes to</th>
                <th>Domain</th>
                <th>Status</th>
                <th className="text-end">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-body-secondary py-4">
                    No aliases found.
                  </td>
                </tr>
              )}
              {rows.map((a) => (
                <tr key={a.address}>
                  <td>
                    <Link
                      href={
                        a.isMailbox
                          ? `/mailboxes/${encodeURIComponent(a.address)}`
                          : `/aliases/${encodeURIComponent(a.address)}/edit`
                      }
                      className="fw-semibold"
                    >
                      {a.address}
                    </Link>
                    {a.isMailbox && (
                      <span className="status-pill ms-2" title="This alias belongs to a mailbox">
                        mailbox
                      </span>
                    )}
                  </td>
                  <td className="small text-body-secondary">{summariseGoto(a.goto)}</td>
                  <td>
                    <Link href={`/domains/${encodeURIComponent(a.domain)}`}>{a.domain}</Link>
                  </td>
                  <td>
                    <StatusPill active={a.active} />
                  </td>
                  <td className="text-end">
                    {!a.isMailbox && (
                      <Link
                        href={`/aliases/${encodeURIComponent(a.address)}/edit`}
                        className="btn btn-sm btn-outline-secondary"
                      >
                        Edit
                      </Link>
                    )}
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
