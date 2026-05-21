'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { audit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { alias, domain, mailbox } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { mbToBytes } from '@/lib/format';

const domainNameRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const domainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(255)
    .regex(domainNameRe, 'Must be a valid domain name (e.g. example.com)'),
  description: z.string().max(255).optional().default(''),
  aliases: z.coerce.number().int().min(0).max(10_000),
  mailboxes: z.coerce.number().int().min(0).max(10_000),
  maxquotaMb: z.coerce.number().int().min(0),
  quotaMb: z.coerce.number().int().min(0),
  transport: z.string().max(255).optional().default(''),
  backupmx: z.coerce.boolean().optional().default(false),
  active: z.coerce.boolean().optional().default(true),
});

export interface DomainActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireSuperadminAction() {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin' || !user.isSuperadmin) {
    throw new Error('Not authorised');
  }
  return user;
}

async function requireDomainAccess(name: string) {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') throw new Error('Not authorised');
  if (!user.isSuperadmin && !(user.allowedDomains ?? []).includes(name)) {
    throw new Error('Not authorised for this domain');
  }
  return user;
}

function parseForm(form: FormData) {
  return domainSchema.safeParse({
    domain: form.get('domain'),
    description: form.get('description') ?? '',
    aliases: form.get('aliases') ?? env.domain.defaultAliases,
    mailboxes: form.get('mailboxes') ?? env.domain.defaultMailboxes,
    maxquotaMb: form.get('maxquotaMb') ?? env.mailbox.defaultQuotaMb,
    quotaMb: form.get('quotaMb') ?? env.domain.defaultQuotaMb,
    transport: form.get('transport') ?? '',
    backupmx: form.get('backupmx') === 'on',
    active: form.get('active') !== 'off',
  });
}

export async function createDomainAction(
  _prev: DomainActionState | undefined,
  formData: FormData,
): Promise<DomainActionState> {
  const user = await requireSuperadminAction();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;

  const [existing] = await db
    .select({ domain: domain.domain })
    .from(domain)
    .where(eq(domain.domain, v.domain))
    .limit(1);
  if (existing) {
    return { error: `Domain ${v.domain} already exists.` };
  }

  const now = new Date();
  await db.insert(domain).values({
    domain: v.domain,
    description: v.description,
    aliases: v.aliases,
    mailboxes: v.mailboxes,
    maxquota: mbToBytes(v.maxquotaMb),
    quota: mbToBytes(v.quotaMb),
    transport: v.transport,
    backupmx: v.backupmx ? 1 : 0,
    active: v.active ? 1 : 0,
    passwordExpiry: 0,
    created: now,
    modified: now,
  });

  await audit(user.username, v.domain, 'create_domain', v.domain);
  revalidatePath('/domains');
  revalidatePath('/dashboard');
  redirect(`/domains/${encodeURIComponent(v.domain)}`);
}

export async function updateDomainAction(
  name: string,
  _prev: DomainActionState | undefined,
  formData: FormData,
): Promise<DomainActionState> {
  const user = await requireDomainAccess(name);
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;
  if (v.domain !== name) {
    return { error: 'Domain name cannot be changed. Delete and recreate instead.' };
  }

  await db
    .update(domain)
    .set({
      description: v.description,
      aliases: v.aliases,
      mailboxes: v.mailboxes,
      maxquota: mbToBytes(v.maxquotaMb),
      quota: mbToBytes(v.quotaMb),
      transport: v.transport,
      backupmx: v.backupmx ? 1 : 0,
      active: v.active ? 1 : 0,
      modified: new Date(),
    })
    .where(eq(domain.domain, name));

  await audit(user.username, name, 'edit_domain', name);
  revalidatePath('/domains');
  revalidatePath(`/domains/${encodeURIComponent(name)}`);
  redirect(`/domains/${encodeURIComponent(name)}`);
}

export async function toggleDomainActiveAction(name: string, _formData?: FormData): Promise<void> {
  const user = await requireSuperadminAction();
  const [row] = await db
    .select({ active: domain.active })
    .from(domain)
    .where(eq(domain.domain, name))
    .limit(1);
  if (!row) return;
  const next = row.active === 1 ? 0 : 1;
  await db
    .update(domain)
    .set({ active: next, modified: new Date() })
    .where(eq(domain.domain, name));
  await audit(user.username, name, 'edit_domain_state', next ? 'active' : 'inactive');
  revalidatePath('/domains');
}

export async function deleteDomainAction(name: string, _formData?: FormData): Promise<void> {
  const user = await requireSuperadminAction();

  // Cascade — phppostfixadmin does this in PHP because MySQL FKs historically
  // weren't reliably set up. We follow suit.
  await db.delete(mailbox).where(eq(mailbox.domain, name));
  await db.delete(alias).where(eq(alias.domain, name));
  await db.delete(domain).where(eq(domain.domain, name));

  await audit(user.username, name, 'delete_domain', name);
  revalidatePath('/domains');
  revalidatePath('/dashboard');
  redirect('/domains');
}
