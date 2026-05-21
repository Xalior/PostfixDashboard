import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/AppShell';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { deleteAdminAction, updateAdminAction } from '@/lib/actions/admin';
import { getCurrentUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { admin, domain, domainAdmins } from '@/lib/db/schema';
import { formatDateTime } from '@/lib/format';

import { AdminForm } from '../AdminForm';

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: decodeURIComponent(username) };
}

export default async function AdminDetailPage({ params }: Props) {
  return (
    <AppShell requireSuperadmin>
      <Inner params={params} />
    </AppShell>
  );
}

async function Inner({ params }: Props) {
  const current = await getCurrentUser();
  if (!current || current.kind !== 'admin') return null;
  const { username: raw } = await params;
  const username = decodeURIComponent(raw);

  const [row] = await db.select().from(admin).where(eq(admin.username, username)).limit(1);
  if (!row) notFound();

  const scoped = await db
    .select({ domain: domainAdmins.domain })
    .from(domainAdmins)
    .where(eq(domainAdmins.username, username));
  const domains = scoped.map((r) => r.domain);
  const allDomains = await db.select({ domain: domain.domain }).from(domain).orderBy(domain.domain);

  const bound = updateAdminAction.bind(null, username);
  const del = deleteAdminAction.bind(null, username);

  return (
    <>
      <PageHeader
        title={row.username}
        icon="bi-shield-lock"
        description="Update role, assigned domains, or reset the password."
        actions={
          current.username !== username && (
            <ConfirmButton
              label="Delete admin"
              action={del}
              title={`Delete ${row.username}?`}
              body="They will lose access immediately."
            />
          )
        }
      />

      <div className="card shadow-sm border-0">
        <div className="card-body">
          <AdminForm
            mode="edit"
            action={bound}
            availableDomains={allDomains.map((d) => d.domain)}
            initial={{
              username: row.username,
              superadmin: row.superadmin === 1 || domains.includes('ALL'),
              active: row.active === 1,
              domains: domains.filter((d) => d !== 'ALL'),
            }}
          />
        </div>
      </div>

      <div className="mt-3 text-body-secondary small">
        Created {formatDateTime(row.created)} · last modified {formatDateTime(row.modified)}
      </div>
    </>
  );
}
