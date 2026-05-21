'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { audit } from '@/lib/audit';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { getCurrentUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { admin, alias, mailbox, vacation } from '@/lib/db/schema';
import { env } from '@/lib/env';

// ---------------------------------------------------------------------------
// Change own password
// ---------------------------------------------------------------------------

const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Current password is required'),
    next: z.string().min(8, 'New password must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export interface UserActionState {
  error?: string;
  success?: string;
}

export async function changeOwnPasswordAction(
  _prev: UserActionState | undefined,
  formData: FormData,
): Promise<UserActionState> {
  const me = await getCurrentUser();
  if (!me) return { error: 'Not signed in.' };

  const parsed = changePasswordSchema.safeParse({
    current: formData.get('current'),
    next: formData.get('next'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;

  if (me.kind === 'user') {
    const [row] = await db.select().from(mailbox).where(eq(mailbox.username, me.username)).limit(1);
    if (!row || !(await verifyPassword(v.current, row.password))) {
      return { error: 'Current password is incorrect.' };
    }
    await db
      .update(mailbox)
      .set({ password: await hashPassword(v.next), modified: new Date() })
      .where(eq(mailbox.username, me.username));
    await audit(me.username, me.domain, 'change_password', me.username);
  } else {
    // Admin self-service: /me/password serves both admins and mailbox users.
    const [row] = await db.select().from(admin).where(eq(admin.username, me.username)).limit(1);
    if (!row || !(await verifyPassword(v.current, row.password))) {
      return { error: 'Current password is incorrect.' };
    }
    await db
      .update(admin)
      .set({ password: await hashPassword(v.next), modified: new Date() })
      .where(eq(admin.username, me.username));
    await audit(me.username, '', 'change_password', me.username);
  }

  return { success: 'Password updated.' };
}

// ---------------------------------------------------------------------------
// Vacation / autoreply
// ---------------------------------------------------------------------------

const vacationSchema = z.object({
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(8192),
  activeFrom: z.string(),
  activeUntil: z.string(),
  active: z.coerce.boolean().optional().default(true),
});

function parseDate(s: string, end = false): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    return end ? new Date('2099-12-31T23:59:59Z') : new Date('1970-01-01T00:00:00Z');
  }
  return d;
}

export async function updateOwnVacationAction(
  _prev: UserActionState | undefined,
  formData: FormData,
): Promise<UserActionState> {
  if (!env.features.vacation) return { error: 'Vacation feature is disabled on this server.' };
  const me = await getCurrentUser();
  if (!me || me.kind !== 'user') return { error: 'Mailbox users only.' };

  const parsed = vacationSchema.safeParse({
    subject: formData.get('subject'),
    body: formData.get('body'),
    activeFrom: formData.get('activeFrom'),
    activeUntil: formData.get('activeUntil'),
    active: formData.get('active') !== 'off',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;

  const now = new Date();
  const activeFrom = parseDate(v.activeFrom, false);
  const activeUntil = parseDate(v.activeUntil, true);

  const [existing] = await db.select().from(vacation).where(eq(vacation.email, me.username)).limit(1);
  if (existing) {
    await db
      .update(vacation)
      .set({
        subject: v.subject,
        body: v.body,
        activeFrom,
        activeUntil,
        active: v.active ? 1 : 0,
        modified: now,
      })
      .where(eq(vacation.email, me.username));
  } else {
    await db.insert(vacation).values({
      email: me.username,
      subject: v.subject,
      body: v.body,
      domain: me.domain,
      cache: '',
      activeFrom,
      activeUntil,
      active: v.active ? 1 : 0,
      created: now,
      modified: now,
    });
  }

  // Flag the self-alias so vacation.pl can pick it up. This follows
  // phppostfixadmin's convention of appending the autoreply address to the
  // goto list when vacation is active, and removing it when disabled.
  const [aliasRow] = await db.select().from(alias).where(eq(alias.address, me.username)).limit(1);
  if (aliasRow) {
    const autoreplyAddr = `${me.username.split('@')[0]}@${env.vacationDomain}`;
    const recipients = aliasRow.goto
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((r) => !r.endsWith(`@${env.vacationDomain}`));
    if (v.active) recipients.push(autoreplyAddr);
    await db
      .update(alias)
      .set({ goto: recipients.join(','), modified: now })
      .where(eq(alias.address, me.username));
  }

  await audit(me.username, me.domain, v.active ? 'edit_vacation' : 'remove_vacation', me.username);
  revalidatePath('/me');
  revalidatePath('/me/vacation');
  return { success: v.active ? 'Vacation reply enabled.' : 'Vacation reply disabled.' };
}
