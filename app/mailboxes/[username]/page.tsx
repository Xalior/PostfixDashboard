import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/AppShell';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  deleteMailboxAction,
  toggleMailboxActiveAction,
  updateMailboxAction,
} from '@/lib/actions/mailbox';
import { canAccessDomain, getCurrentUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { mailbox } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { bytesToMb, formatBytes, formatDateTime } from '@/lib/format';

import { MailboxForm } from '../MailboxForm';

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: decodeURIComponent(username) };
}

export default async function MailboxDetailPage({ params }: Props) {
  return (
    <AppShell requireAdmin>
      <Inner params={params} />
    </AppShell>
  );
}

async function Inner({ params }: Props) {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') return null;
  const { username: raw } = await params;
  const username = decodeURIComponent(raw);

  const [row] = await db.select().from(mailbox).where(eq(mailbox.username, username)).limit(1);
  if (!row || !canAccessDomain(user, row.domain)) notFound();

  const bound = updateMailboxAction.bind(null, username);
  const del = deleteMailboxAction.bind(null, username);
  const toggle = toggleMailboxActiveAction.bind(null, username);

  return (
    <>
      <PageHeader
        title={row.username}
        icon="bi-person-fill"
        description={row.name || 'No display name set.'}
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
              title={`Delete ${row.username}?`}
              body="This will remove the mailbox and its self-alias. Any other aliases pointing to this address will remain but will no longer deliver."
            />
          </>
        }
      />

      <div className="row g-3 mb-4">
        <StatCard label="Status" value={<StatusPill active={row.active === 1} />} />
        <StatCard label="Quota" value={row.quota > 0 ? formatBytes(Number(row.quota)) : '∞'} />
        <StatCard
          label="Domain"
          value={<Link href={`/domains/${encodeURIComponent(row.domain)}`}>{row.domain}</Link>}
        />
        <StatCard label="Maildir" value={<code className="small">{row.maildir}</code>} />
      </div>

      <div className="card shadow-sm border-0">
        <div className="card-body">
          <MailboxForm
            mode="edit"
            action={bound}
            availableDomains={[row.domain]}
            defaultQuotaMb={env.mailbox.defaultQuotaMb}
            initial={{
              localpart: row.localPart,
              domain: row.domain,
              name: row.name,
              quotaMb: bytesToMb(Number(row.quota)),
              active: row.active === 1,
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

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="col-6 col-lg-3">
      <div className="card h-100 shadow-sm border-0">
        <div className="card-body">
          <div className="small text-body-secondary text-uppercase">{label}</div>
          <div className="fs-6 fw-semibold text-truncate">{value}</div>
        </div>
      </div>
    </div>
  );
}
