import { eq } from 'drizzle-orm';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCurrentUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { vacation } from '@/lib/db/schema';
import { env } from '@/lib/env';

import { VacationForm } from './VacationForm';

export const metadata = { title: 'Vacation autoreply' };

export default async function VacationPage() {
  return (
    <AppShell requireUser>
      <Inner />
    </AppShell>
  );
}

async function Inner() {
  if (!env.features.vacation) {
    return (
      <>
        <PageHeader title="Vacation autoreply" icon="bi-airplane" />
        <div className="alert alert-warning">
          The vacation / autoreply feature is disabled on this server.
        </div>
      </>
    );
  }

  const me = await getCurrentUser();
  if (!me || me.kind !== 'user') return null;

  const [row] = await db.select().from(vacation).where(eq(vacation.email, me.username)).limit(1);

  return (
    <>
      <PageHeader
        title="Vacation autoreply"
        icon="bi-airplane"
        description="Automatically reply to incoming messages while you're away."
      />
      <div className="card shadow-sm border-0">
        <div className="card-body">
          <VacationForm
            initial={
              row
                ? {
                    subject: row.subject,
                    body: row.body,
                    activeFrom: toDateInput(row.activeFrom),
                    activeUntil: toDateInput(row.activeUntil),
                    active: row.active === 1,
                  }
                : undefined
            }
          />
        </div>
      </div>
    </>
  );
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
