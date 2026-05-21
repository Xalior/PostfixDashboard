import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { createAliasAction } from '@/lib/actions/alias';
import { getCurrentUser } from '@/lib/auth/current-user';
import { listDomains } from '@/lib/queries';

import { AliasForm } from '../AliasForm';

export const metadata = { title: 'New alias' };

interface Props {
  searchParams: Promise<{ domain?: string }>;
}

export default async function NewAliasPage({ searchParams }: Props) {
  return (
    <AppShell requireAdmin>
      <Inner searchParams={searchParams} />
    </AppShell>
  );
}

async function Inner({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') return null;
  const { domain: preferred } = await searchParams;
  const domains = await listDomains(user);
  const availableDomains = domains.filter((d) => d.active).map((d) => d.domain);

  return (
    <>
      <PageHeader
        title="New alias"
        icon="bi-plus-circle"
        description="Forward a single address to one or more recipients."
      />
      <div className="card shadow-sm border-0">
        <div className="card-body">
          <AliasForm
            mode="create"
            action={createAliasAction}
            availableDomains={availableDomains}
            initial={preferred ? { domain: preferred } : undefined}
          />
        </div>
      </div>
    </>
  );
}
