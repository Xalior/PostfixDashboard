import Link from 'next/link';
import { eq } from 'drizzle-orm';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { QuotaBar } from '@/components/ui/QuotaBar';
import { StatusPill } from '@/components/ui/StatusPill';
import { getCurrentUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { mailbox, quota2, vacation } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { formatBytes, formatDateTime } from '@/lib/format';

export const metadata = { title: 'My mailbox' };

export default async function MyMailboxPage() {
  return (
    <AppShell requireUser>
      <Inner />
    </AppShell>
  );
}

async function Inner() {
  const me = await getCurrentUser();
  if (!me || me.kind !== 'user') return null;

  const [row] = await db.select().from(mailbox).where(eq(mailbox.username, me.username)).limit(1);
  if (!row) return null;

  const [usage] = await db.select().from(quota2).where(eq(quota2.username, me.username)).limit(1);
  const [vac] = await db.select().from(vacation).where(eq(vacation.email, me.username)).limit(1);
  const usedBytes = usage ? Number(usage.bytes) : 0;

  return (
    <>
      <PageHeader
        title={row.name || row.username}
        icon="bi-person-fill"
        description={row.username}
      />

      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <div className="small text-body-secondary text-uppercase">Quota</div>
              {Number(row.quota) > 0 ? (
                <>
                  <div className="fs-5 fw-semibold">
                    {formatBytes(usedBytes)} / {formatBytes(Number(row.quota))}
                  </div>
                  <QuotaBar usedBytes={usedBytes} maxBytes={Number(row.quota)} compact />
                </>
              ) : (
                <div className="fs-5 fw-semibold">{formatBytes(usedBytes)} / ∞</div>
              )}
              {usage?.messages != null && (
                <div className="small text-body-secondary mt-1">{usage.messages} message(s)</div>
              )}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-body">
              <div className="small text-body-secondary text-uppercase">Vacation</div>
              {vac && vac.active === 1 ? (
                <>
                  <div className="fs-6 fw-semibold">{vac.subject}</div>
                  <div className="small text-body-secondary">
                    {formatDateTime(vac.activeFrom)} → {formatDateTime(vac.activeUntil)}
                  </div>
                </>
              ) : (
                <div className="fs-6 text-body-secondary">No autoreply configured.</div>
              )}
              {env.features.vacation && (
                <Link href="/me/vacation" className="btn btn-sm btn-outline-primary mt-2">
                  Manage autoreply
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm border-0">
        <div className="card-body">
          <h2 className="h6 mb-3">Account</h2>
          <dl className="row mb-0">
            <dt className="col-sm-3 text-body-secondary">Address</dt>
            <dd className="col-sm-9">{row.username}</dd>
            <dt className="col-sm-3 text-body-secondary">Status</dt>
            <dd className="col-sm-9">
              <StatusPill active={row.active === 1} />
            </dd>
            <dt className="col-sm-3 text-body-secondary">Domain</dt>
            <dd className="col-sm-9">{row.domain}</dd>
            <dt className="col-sm-3 text-body-secondary">Created</dt>
            <dd className="col-sm-9">{formatDateTime(row.created)}</dd>
          </dl>
          <div className="mt-3">
            <Link href="/me/password" className="btn btn-outline-primary">
              <i className="bi bi-key me-1" aria-hidden="true" />
              Change password
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
