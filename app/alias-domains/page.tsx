import Link from 'next/link';

import { AppShell } from '@/components/layout/AppShell';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { deleteAliasDomainAction } from '@/lib/actions/alias';
import { getCurrentUser } from '@/lib/auth/current-user';
import { formatDateTime } from '@/lib/format';
import { listAliasDomains } from '@/lib/queries';

export const metadata = { title: 'Alias domains' };

export default async function AliasDomainsPage() {
  return (
    <AppShell requireAdmin>
      <Inner />
    </AppShell>
  );
}

async function Inner() {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') return null;
  const rows = await listAliasDomains(user);

  return (
    <>
      <PageHeader
        title="Alias domains"
        icon="bi-diagram-3"
        description="Map one entire domain onto another. Every mailbox and alias on the alias domain transparently delivers to the target domain."
        actions={
          <Link href="/alias-domains/new" className="btn btn-primary">
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            New alias domain
          </Link>
        }
      />

      <div className="card shadow-sm border-0">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Alias domain</th>
                <th />
                <th>Target domain</th>
                <th>Status</th>
                <th>Created</th>
                <th className="text-end">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-body-secondary py-4">
                    No alias domains configured.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const del = deleteAliasDomainAction.bind(null, r.aliasDomain);
                return (
                  <tr key={r.aliasDomain}>
                    <td className="fw-semibold">{r.aliasDomain}</td>
                    <td className="text-body-secondary">
                      <i className="bi bi-arrow-right" aria-hidden="true" />
                    </td>
                    <td>
                      <Link href={`/domains/${encodeURIComponent(r.targetDomain)}`}>{r.targetDomain}</Link>
                    </td>
                    <td>
                      <StatusPill active={r.active} />
                    </td>
                    <td className="text-body-secondary small">{formatDateTime(r.created)}</td>
                    <td className="text-end">
                      <ConfirmButton
                        label="Delete"
                        size="sm"
                        action={del}
                        title={`Delete ${r.aliasDomain}?`}
                        body={`This will remove the domain alias ${r.aliasDomain} → ${r.targetDomain}.`}
                      />
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
