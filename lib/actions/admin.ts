'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth/password';
import { getCurrentUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';
import { admin, domainAdmins } from '@/lib/db/schema';

const createSchema = z.object({
  username: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  superadmin: z.coerce.boolean().optional().default(false),
  active: z.coerce.boolean().optional().default(true),
  domains: z
    .array(z.string().trim().toLowerCase())
    .optional()
    .default([]),
});

const editSchema = createSchema.extend({
  password: z.string().optional().default(''),
});

export interface AdminActionState {
  error?: string;
}

async function requireSuperadminAction() {
  const user = await getCurrentUser();
  if (!user || user.kind !== 'admin' || !user.isSuperadmin) {
    throw new Error('Not authorised');
  }
  return user;
}

function extractDomains(formData: FormData): string[] {
  return formData
    .getAll('domains')
    .map((v) => String(v).trim().toLowerCase())
    .filter(Boolean);
}

async function syncDomainAdmins(username: string, domains: string[], superadmin: boolean) {
  // Clear existing mappings for this admin, then insert the new set. Simple
  // and correct — domain_admins is small and the write pattern is rare.
  await db.delete(domainAdmins).where(eq(domainAdmins.username, username));
  if (superadmin) {
    // Back-compat: keep a domain='ALL' row so older phppostfixadmin installs
    // still see this user as super.
    await db.insert(domainAdmins).values({
      username,
      domain: 'ALL',
      active: 1,
      created: new Date(),
    });
    return;
  }
  if (domains.length === 0) return;
  await db.insert(domainAdmins).values(
    domains.map((d) => ({
      username,
      domain: d,
      active: 1,
      created: new Date(),
    })),
  );
}

export async function createAdminAction(
  _prev: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const current = await requireSuperadminAction();
  const parsed = createSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
    superadmin: formData.get('superadmin') === 'on',
    active: formData.get('active') !== 'off',
    domains: extractDomains(formData),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;

  const [existing] = await db.select().from(admin).where(eq(admin.username, v.username)).limit(1);
  if (existing) return { error: `Admin ${v.username} already exists.` };

  const now = new Date();
  await db.insert(admin).values({
    username: v.username,
    password: await hashPassword(v.password),
    superadmin: v.superadmin ? 1 : 0,
    active: v.active ? 1 : 0,
    created: now,
    modified: now,
  });

  await syncDomainAdmins(v.username, v.domains, v.superadmin);
  await audit(current.username, '', 'create_admin', v.username);
  revalidatePath('/admins');
  redirect(`/admins/${encodeURIComponent(v.username)}`);
}

export async function updateAdminAction(
  username: string,
  _prev: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const current = await requireSuperadminAction();

  const parsed = editSchema.safeParse({
    username,
    password: formData.get('password') ?? '',
    superadmin: formData.get('superadmin') === 'on',
    active: formData.get('active') !== 'off',
    domains: extractDomains(formData),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;

  const update: Partial<typeof admin.$inferInsert> = {
    superadmin: v.superadmin ? 1 : 0,
    active: v.active ? 1 : 0,
    modified: new Date(),
  };
  if (v.password && v.password.length > 0) {
    if (v.password.length < 8) return { error: 'Password must be at least 8 characters.' };
    update.password = await hashPassword(v.password);
  }
  await db.update(admin).set(update).where(eq(admin.username, username));
  await syncDomainAdmins(username, v.domains, v.superadmin);
  await audit(current.username, '', 'edit_admin', username);
  revalidatePath('/admins');
  revalidatePath(`/admins/${encodeURIComponent(username)}`);
  redirect(`/admins/${encodeURIComponent(username)}`);
}

export async function deleteAdminAction(username: string, _formData?: FormData): Promise<void> {
  const current = await requireSuperadminAction();
  if (current.username === username) {
    throw new Error('Cannot delete your own account.');
  }
  await db.delete(domainAdmins).where(eq(domainAdmins.username, username));
  await db.delete(admin).where(eq(admin.username, username));
  await audit(current.username, '', 'delete_admin', username);
  revalidatePath('/admins');
  redirect('/admins');
}
