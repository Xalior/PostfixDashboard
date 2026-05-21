'use server';

import { count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { audit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { alias, aliasDomain, domain, mailbox } from '@/lib/db/schema';

const emailSchema = z.string().trim().toLowerCase().email();
const domainNameRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const localpartRe = /^[a-z0-9._%+-]+$/;

const gotoSchema = z
  .string()
  .trim()
  .min(1)
  .transform((s) =>
    s
      .split(/[,\n]/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  )
  .refine((arr) => arr.length > 0, 'At least one recipient is required')
  .refine(
    (arr) => arr.every((r) => emailSchema.safeParse(r).success),
    'All recipients must be valid email addresses',
  );

const createAliasSchema = z.object({
  localpart: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(255)
    .regex(localpartRe, 'Invalid local part'),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(domainNameRe, 'Must be a valid domain name'),
  goto: gotoSchema,
  active: z.coerce.boolean().optional().default(true),
});

const updateAliasSchema = z.object({
  goto: gotoSchema,
  active: z.coerce.boolean().optional().default(true),
});

export interface AliasActionState {
  error?: string;
}

async function requireAdminForDomain(d: string) {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin') throw new Error('Not authorised');
  if (!user.isSuperadmin && !(user.allowedDomains ?? []).includes(d)) {
    throw new Error('Not authorised for this domain');
  }
  return user;
}

async function requireSuperadminAction() {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin' || !user.isSuperadmin) {
    throw new Error('Not authorised');
  }
  return user;
}

export async function createAliasAction(
  _prev: AliasActionState | undefined,
  formData: FormData,
): Promise<AliasActionState> {
  const parsed = createAliasSchema.safeParse({
    localpart: formData.get('localpart'),
    domain: formData.get('domain'),
    goto: formData.get('goto') ?? '',
    active: formData.get('active') !== 'off',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;
  const address = `${v.localpart}@${v.domain}`;
  if (!emailSchema.safeParse(address).success) {
    return { error: `"${address}" is not a valid email address.` };
  }

  const user = await requireAdminForDomain(v.domain);

  const [dom] = await db.select().from(domain).where(eq(domain.domain, v.domain)).limit(1);
  if (!dom) return { error: `Domain ${v.domain} does not exist.` };

  if (dom.aliases > 0) {
    const [{ value: aliasCount }] = await db
      .select({ value: count() })
      .from(alias)
      .where(eq(alias.domain, v.domain));
    if (Number(aliasCount) >= dom.aliases) {
      return { error: `This domain has reached its alias limit of ${dom.aliases}.` };
    }
  }

  const [existing] = await db.select().from(alias).where(eq(alias.address, address)).limit(1);
  if (existing) return { error: `Alias ${address} already exists.` };

  // Reject aliases that shadow a mailbox (mailbox creation owns its self-alias).
  const [shadowing] = await db.select().from(mailbox).where(eq(mailbox.username, address)).limit(1);
  if (shadowing) {
    return {
      error: `A mailbox already exists at ${address}. Edit the mailbox to set up forwarding.`,
    };
  }

  const now = new Date();
  await db.insert(alias).values({
    address,
    goto: v.goto.join(','),
    domain: v.domain,
    active: v.active ? 1 : 0,
    created: now,
    modified: now,
  });

  await audit(user.username, v.domain, 'create_alias', address);
  revalidatePath('/aliases');
  revalidatePath(`/domains/${encodeURIComponent(v.domain)}`);
  redirect(`/aliases/${encodeURIComponent(address)}/edit`);
}

export async function updateAliasAction(
  address: string,
  _prev: AliasActionState | undefined,
  formData: FormData,
): Promise<AliasActionState> {
  const [row] = await db.select().from(alias).where(eq(alias.address, address)).limit(1);
  if (!row) return { error: 'Alias not found.' };
  const user = await requireAdminForDomain(row.domain);

  const parsed = updateAliasSchema.safeParse({
    goto: formData.get('goto') ?? '',
    active: formData.get('active') !== 'off',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;

  await db
    .update(alias)
    .set({
      goto: v.goto.join(','),
      active: v.active ? 1 : 0,
      modified: new Date(),
    })
    .where(eq(alias.address, address));

  await audit(user.username, row.domain, 'edit_alias', address);
  revalidatePath('/aliases');
  revalidatePath(`/aliases/${encodeURIComponent(address)}/edit`);
  revalidatePath(`/domains/${encodeURIComponent(row.domain)}`);
  redirect('/aliases');
}

export async function toggleAliasActiveAction(
  address: string,
  _formData?: FormData,
): Promise<void> {
  const [row] = await db.select().from(alias).where(eq(alias.address, address)).limit(1);
  if (!row) return;
  const user = await requireAdminForDomain(row.domain);
  const next = row.active === 1 ? 0 : 1;
  await db.update(alias).set({ active: next, modified: new Date() }).where(eq(alias.address, address));
  await audit(user.username, row.domain, 'edit_alias_state', `${address}=${next ? 'active' : 'inactive'}`);
  revalidatePath('/aliases');
}

export async function deleteAliasAction(
  address: string,
  _formData?: FormData,
): Promise<void> {
  const [row] = await db.select().from(alias).where(eq(alias.address, address)).limit(1);
  if (!row) return;
  const user = await requireAdminForDomain(row.domain);

  // Refuse to delete a mailbox's self-alias — delete the mailbox instead.
  const [isMailbox] = await db.select().from(mailbox).where(eq(mailbox.username, address)).limit(1);
  if (isMailbox) return;

  await db.delete(alias).where(eq(alias.address, address));
  await audit(user.username, row.domain, 'delete_alias', address);
  revalidatePath('/aliases');
  revalidatePath(`/domains/${encodeURIComponent(row.domain)}`);
  redirect('/aliases');
}

// ---------------------------------------------------------------------------
// Alias-domain (domain -> domain) actions
// ---------------------------------------------------------------------------

const aliasDomainSchema = z.object({
  aliasDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(domainNameRe, 'Must be a valid domain name'),
  targetDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(domainNameRe, 'Must be a valid domain name'),
  active: z.coerce.boolean().optional().default(true),
});

export async function createAliasDomainAction(
  _prev: AliasActionState | undefined,
  formData: FormData,
): Promise<AliasActionState> {
  const parsed = aliasDomainSchema.safeParse({
    aliasDomain: formData.get('aliasDomain'),
    targetDomain: formData.get('targetDomain'),
    active: formData.get('active') !== 'off',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;
  if (v.aliasDomain === v.targetDomain) {
    return { error: 'Alias domain cannot point at itself.' };
  }

  // Alias-domain ops are superadmin-only: a domain admin could otherwise
  // register an arbitrary `aliasDomain` and hijack unrelated mail.
  const user = await requireSuperadminAction();

  const [target] = await db.select().from(domain).where(eq(domain.domain, v.targetDomain)).limit(1);
  if (!target) return { error: `Target domain ${v.targetDomain} does not exist.` };

  const [existing] = await db
    .select()
    .from(aliasDomain)
    .where(eq(aliasDomain.aliasDomain, v.aliasDomain))
    .limit(1);
  if (existing) return { error: `Alias domain ${v.aliasDomain} already exists.` };

  // Prevent chaining.
  const [chained] = await db
    .select()
    .from(aliasDomain)
    .where(eq(aliasDomain.aliasDomain, v.targetDomain))
    .limit(1);
  if (chained) return { error: `${v.targetDomain} is itself an alias domain. Chains are not allowed.` };

  const now = new Date();
  await db.insert(aliasDomain).values({
    aliasDomain: v.aliasDomain,
    targetDomain: v.targetDomain,
    active: v.active ? 1 : 0,
    created: now,
    modified: now,
  });

  await audit(user.username, v.targetDomain, 'create_alias_domain', `${v.aliasDomain}->${v.targetDomain}`);
  revalidatePath('/alias-domains');
  redirect('/alias-domains');
}

export async function deleteAliasDomainAction(
  aliasName: string,
  _formData?: FormData,
): Promise<void> {
  const [row] = await db
    .select()
    .from(aliasDomain)
    .where(eq(aliasDomain.aliasDomain, aliasName))
    .limit(1);
  if (!row) return;
  const user = await requireSuperadminAction();
  await db.delete(aliasDomain).where(eq(aliasDomain.aliasDomain, aliasName));
  await audit(user.username, row.targetDomain, 'delete_alias_domain', aliasName);
  revalidatePath('/alias-domains');
  redirect('/alias-domains');
}
