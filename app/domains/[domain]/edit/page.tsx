import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { updateDomainAction } from '@/lib/actions/domain';
import { getCurrentUser } from '@/lib/auth/current-user';
import { bytesToMb } from '@/lib/format';
import { env } from '@/lib/env';
import { getDomain } from '@/lib/queries';

import { DomainForm } from '../../DomainForm';

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { domain } = await params;
  return { title: `Edit ${decodeURIComponent(domain)}` };
}

export default async function EditDomainPage({ params }: Props) {
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

  const bound = updateDomainAction.bind(null, name);

  return (
    <>
      <PageHeader
        title={`Edit ${d.domain}`}
        icon="bi-pencil-square"
        description="Update limits, description, and Postfix transport."
      />
      <div className="card shadow-sm border-0">
        <div className="card-body">
          <DomainForm
            mode="edit"
            action={bound}
            defaults={{
              aliases: env.domain.defaultAliases,
              mailboxes: env.domain.defaultMailboxes,
              maxquotaMb: env.mailbox.defaultQuotaMb,
              quotaMb: env.domain.defaultQuotaMb,
            }}
            initial={{
              domain: d.domain,
              description: d.description,
              aliases: d.aliases,
              mailboxes: d.mailboxes,
              maxquotaMb: bytesToMb(Number(d.maxquota)),
              quotaMb: bytesToMb(Number(d.quota)),
              transport: d.transport,
              backupmx: d.backupmx === 1,
              active: d.active === 1,
            }}
          />
        </div>
      </div>
    </>
  );
}
