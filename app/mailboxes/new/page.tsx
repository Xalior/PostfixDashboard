import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { createMailboxAction } from '@/lib/actions/mailbox';
import { getCurrentUser } from '@/lib/auth/current-user';
import { env } from '@/lib/env';
import { listDomains } from '@/lib/queries';

import { MailboxForm } from '../MailboxForm';

export const metadata = { title: 'New mailbox' };

interface Props {
  searchParams: Promise<{ domain?: string }>;
}

export default async function NewMailboxPage({ searchParams }: Props) {
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
        title="New mailbox"
        icon="bi-plus-circle"
        description="Create a new mailbox. Postfix/Dovecot will see it as soon as the record exists."
      />
      <div className="card shadow-sm border-0">
        <div className="card-body">
          <MailboxForm
            mode="create"
            action={createMailboxAction}
            availableDomains={availableDomains}
            defaultQuotaMb={env.mailbox.defaultQuotaMb}
            initial={preferred ? { domain: preferred } : undefined}
          />
        </div>
      </div>
    </>
  );
}
