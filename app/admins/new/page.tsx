import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { createAdminAction } from '@/lib/actions/admin';
import { db } from '@/lib/db';
import { domain } from '@/lib/db/schema';

import { AdminForm } from '../AdminForm';

export const metadata = { title: 'New administrator' };

export default async function NewAdminPage() {
  return (
    <AppShell requireSuperadmin>
      <Inner />
    </AppShell>
  );
}

async function Inner() {
  // Query runs only after AppShell has authenticated the superadmin.
  const domains = await db.select({ domain: domain.domain }).from(domain).orderBy(domain.domain);
  return (
    <>
      <PageHeader title="New administrator" icon="bi-plus-circle" />
      <div className="card shadow-sm border-0">
        <div className="card-body">
          <AdminForm
            mode="create"
            action={createAdminAction}
            availableDomains={domains.map((d) => d.domain)}
          />
        </div>
      </div>
    </>
  );
}
