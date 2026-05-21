import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCurrentUser } from '@/lib/auth/current-user';
import { listDomains } from '@/lib/queries';
import { NewAliasDomainForm } from './NewAliasDomainForm';

export const metadata = { title: 'New alias domain' };

export default async function NewAliasDomainPage() {
  return (
    <AppShell requireSuperadmin>
      <Inner />
    </AppShell>
  );
}

async function Inner() {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') return null;
  const domains = await listDomains(user);
  const targets = domains.filter((d) => d.active).map((d) => d.domain);

  return (
    <>
      <PageHeader
        title="New alias domain"
        icon="bi-plus-circle"
        description="Point an entire domain at another. The target must already exist on this server."
      />
      <div className="card shadow-sm border-0">
        <div className="card-body">
          <NewAliasDomainForm targets={targets} />
        </div>
      </div>
    </>
  );
}
