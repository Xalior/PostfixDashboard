import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { createDomainAction } from '@/lib/actions/domain';
import { env } from '@/lib/env';

import { DomainForm } from '../DomainForm';

export const metadata = { title: 'New domain' };

export default function NewDomainPage() {
  return (
    <AppShell requireSuperadmin>
      <PageHeader
        title="New domain"
        description="Add a new domain to this mail server."
        icon="bi-plus-circle"
      />
      <div className="card shadow-sm border-0">
        <div className="card-body">
          <DomainForm
            mode="create"
            action={createDomainAction}
            defaults={{
              aliases: env.domain.defaultAliases,
              mailboxes: env.domain.defaultMailboxes,
              maxquotaMb: env.mailbox.defaultQuotaMb,
              quotaMb: env.domain.defaultQuotaMb,
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
