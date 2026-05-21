import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/AppShell';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  deleteAliasAction,
  toggleAliasActiveAction,
  updateAliasAction,
} from '@/lib/actions/alias';
import { canAccessDomain, getCurrentUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { alias, mailbox } from '@/lib/db/schema';

import { AliasForm } from '../../AliasForm';

interface Props {
  params: Promise<{ address: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { address } = await params;
  return { title: decodeURIComponent(address) };
}

export default async function EditAliasPage({ params }: Props) {
  return (
    <AppShell requireAdmin>
      <Inner params={params} />
    </AppShell>
  );
}

async function Inner({ params }: Props) {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') return null;
  const { address: raw } = await params;
  const address = decodeURIComponent(raw);

  const [row] = await db.select().from(alias).where(eq(alias.address, address)).limit(1);
  if (!row || !canAccessDomain(user, row.domain)) notFound();

  const [mbox] = await db.select().from(mailbox).where(eq(mailbox.username, address)).limit(1);
  if (mbox) {
    // Aliases owned by a mailbox are managed through the mailbox page.
    return (
      <>
        <PageHeader title={address} icon="bi-envelope" />
        <div className="alert alert-info">
          This alias is owned by a mailbox.{' '}
          <Link href={`/mailboxes/${encodeURIComponent(address)}`}>
            Manage the mailbox instead.
          </Link>
        </div>
      </>
    );
  }

  const bound = updateAliasAction.bind(null, address);
  const del = deleteAliasAction.bind(null, address);
  const toggle = toggleAliasActiveAction.bind(null, address);

  return (
    <>
      <PageHeader
        title={address}
        icon="bi-arrow-left-right"
        actions={
          <>
            <form action={toggle}>
              <button className="btn btn-outline-secondary">
                <i className="bi bi-toggle-on me-1" aria-hidden="true" />
                {row.active === 1 ? 'Disable' : 'Enable'}
              </button>
            </form>
            <ConfirmButton
              label="Delete"
              action={del}
              title={`Delete ${address}?`}
              body="Mail to this alias will no longer be forwarded."
            />
          </>
        }
      />

      <div className="card shadow-sm border-0">
        <div className="card-body">
          <AliasForm
            mode="edit"
            action={bound}
            initial={{
              address: row.address,
              domain: row.domain,
              goto: row.goto
                .split(/[,\n]/)
                .map((s) => s.trim())
                .filter(Boolean)
                .join('\n'),
              active: row.active === 1,
            }}
          />
        </div>
      </div>
    </>
  );
}
