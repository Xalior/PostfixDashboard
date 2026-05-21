'use server';

import { and, count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth/password';
import { getCurrentUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { alias, domain, mailbox } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { mbToBytes } from '@/lib/format';
import { buildMaildir } from '@/lib/mailbox-path';

const emailSchema = z.string().trim().toLowerCase().email();

const baseSchema = z.object({
  localpart: z.string().trim().toLowerCase().min(1).max(255).regex(/^[a-z0-9._%+-]+$/, 'Invalid local part'),
  domain: z.string().trim().toLowerCase().min(3).max(255),
  name: z.string().max(255).optional().default(''),
  quotaMb: z.coerce.number().int().min(0),
  active: z.coerce.boolean().optional().default(true),
});

const createSchema = baseSchema.extend({
  password: z.string().min(8, 'Password must be at least 8 characters').max(255),
});

const editSchema = baseSchema.extend({
  password: z.string().max(255).optional().default(''),
});

export interface MailboxActionState {
  error?: string;
}

async function requireAdminForDomain(domainName: string) {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') throw new Error('Not authorised');
  if (!user.isSuperadmin && !(user.allowedDomains ?? []).includes(domainName)) {
    throw new Error('Not authorised for this domain');
  }
  return user;
}

export async function createMailboxAction(
  _prev: MailboxActionState | undefined,
  formData: FormData,
): Promise<MailboxActionState> {
  const parsed = createSchema.safeParse({
    localpart: formData.get('localpart'),
    domain: formData.get('domain'),
    name: formData.get('name') ?? '',
    quotaMb: formData.get('quotaMb') ?? env.mailbox.defaultQuotaMb,
    active: formData.get('active') !== 'off',
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;
  const username = `${v.localpart}@${v.domain}`;
  if (!emailSchema.safeParse(username).success) {
    return { error: `"${username}" is not a valid email address.` };
  }

  const user = await requireAdminForDomain(v.domain);

  const [dom] = await db.select().from(domain).where(eq(domain.domain, v.domain)).limit(1);
  if (!dom) return { error: `Domain ${v.domain} does not exist.` };

  // Limit check
  if (dom.mailboxes > 0) {
    const [{ value: currentCount }] = await db
      .select({ value: count() })
      .from(mailbox)
      .where(eq(mailbox.domain, v.domain));
    if (Number(currentCount) >= dom.mailboxes) {
      return { error: `This domain already has ${currentCount} mailbox(es) — at its configured limit.` };
    }
  }

  // Quota ceiling
  const quotaBytes = mbToBytes(v.quotaMb);
  if (Number(dom.maxquota) > 0 && quotaBytes > Number(dom.maxquota)) {
    return {
      error: `Quota exceeds domain maximum of ${Math.round(Number(dom.maxquota) / 1024 / 1024)} MB.`,
    };
  }

  // Uniqueness
  const [existing] = await db.select().from(mailbox).where(eq(mailbox.username, username)).limit(1);
  if (existing) return { error: `Mailbox ${username} already exists.` };

  const now = new Date();
  const maildir = buildMaildir(v.localpart, v.domain, env.mailbox.maildirTemplate);
  const passwordHash = await hashPassword(v.password);

  await db.insert(mailbox).values({
    username,
    password: passwordHash,
    name: v.name,
    maildir,
    quota: quotaBytes,
    localPart: v.localpart,
    domain: v.domain,
    active: v.active ? 1 : 0,
    created: now,
    modified: now,
  });

  // phppostfixadmin creates a self-alias so postfix can resolve delivery.
  await db.insert(alias).values({
    address: username,
    goto: username,
    domain: v.domain,
    active: v.active ? 1 : 0,
    created: now,
    modified: now,
  });

  await audit(user.username, v.domain, 'create_mailbox', username);
  revalidatePath('/mailboxes');
  revalidatePath(`/domains/${encodeURIComponent(v.domain)}`);
  redirect(`/mailboxes/${encodeURIComponent(username)}`);
}

export async function updateMailboxAction(
  username: string,
  _prev: MailboxActionState | undefined,
  formData: FormData,
): Promise<MailboxActionState> {
  const [row] = await db.select().from(mailbox).where(eq(mailbox.username, username)).limit(1);
  if (!row) return { error: 'Mailbox not found.' };
  const user = await requireAdminForDomain(row.domain);

  const parsed = editSchema.safeParse({
    localpart: formData.get('localpart') ?? row.localPart,
    domain: formData.get('domain') ?? row.domain,
    name: formData.get('name') ?? row.name,
    quotaMb: formData.get('quotaMb') ?? Math.round(Number(row.quota) / 1024 / 1024),
    active: formData.get('active') !== 'off',
    password: formData.get('password') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;
  if (v.domain !== row.domain || v.localpart !== row.localPart) {
    return { error: 'Address cannot be changed. Delete and recreate instead.' };
  }

  const quotaBytes = mbToBytes(v.quotaMb);

  const update: Partial<typeof mailbox.$inferInsert> = {
    name: v.name,
    quota: quotaBytes,
    active: v.active ? 1 : 0,
    modified: new Date(),
  };
  if (v.password && v.password.length >= 8) {
    update.password = await hashPassword(v.password);
  } else if (v.password && v.password.length > 0) {
    return { error: 'Password must be at least 8 characters.' };
  }

  await db.update(mailbox).set(update).where(eq(mailbox.username, username));

  // Keep the self-alias's active flag in sync.
  await db
    .update(alias)
    .set({ active: v.active ? 1 : 0, modified: new Date() })
    .where(and(eq(alias.address, username), eq(alias.goto, username)));

  await audit(user.username, row.domain, 'edit_mailbox', username);
  revalidatePath('/mailboxes');
  revalidatePath(`/mailboxes/${encodeURIComponent(username)}`);
  revalidatePath(`/domains/${encodeURIComponent(row.domain)}`);
  redirect(`/mailboxes/${encodeURIComponent(username)}`);
}

export async function toggleMailboxActiveAction(
  username: string,
  _formData?: FormData,
): Promise<void> {
  const [row] = await db.select().from(mailbox).where(eq(mailbox.username, username)).limit(1);
  if (!row) return;
  const user = await requireAdminForDomain(row.domain);
  const next = row.active === 1 ? 0 : 1;
  await db
    .update(mailbox)
    .set({ active: next, modified: new Date() })
    .where(eq(mailbox.username, username));
  await db
    .update(alias)
    .set({ active: next, modified: new Date() })
    .where(and(eq(alias.address, username), eq(alias.goto, username)));
  await audit(user.username, row.domain, 'edit_mailbox_state', `${username}=${next ? 'active' : 'inactive'}`);
  revalidatePath('/mailboxes');
  revalidatePath(`/mailboxes/${encodeURIComponent(username)}`);
}

export async function deleteMailboxAction(
  username: string,
  _formData?: FormData,
): Promise<void> {
  const [row] = await db.select().from(mailbox).where(eq(mailbox.username, username)).limit(1);
  if (!row) return;
  const user = await requireAdminForDomain(row.domain);

  // Delete mailbox + its self-alias (and any alias that only points to it? No:
  // phppostfixadmin leaves other aliases alone so the admin can clean them up.)
  await db.delete(alias).where(and(eq(alias.address, username), eq(alias.goto, username)));
  await db.delete(mailbox).where(eq(mailbox.username, username));

  await audit(user.username, row.domain, 'delete_mailbox', username);
  revalidatePath('/mailboxes');
  revalidatePath(`/domains/${encodeURIComponent(row.domain)}`);
  redirect('/mailboxes');
}
