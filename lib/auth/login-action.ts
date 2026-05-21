'use server';

import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { audit } from '@/lib/audit';
import { db } from '@/lib/db';
import { admin, domainAdmins, mailbox } from '@/lib/db/schema';
import { verifyPassword } from './password';
import { createSession, destroySession, type SessionRole } from './session';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').email('Must be an email'),
  password: z.string().min(1, 'Password is required'),
});

export interface LoginState {
  error?: string;
}

/**
 * Server action invoked by the login form. Tries the admin table first, then
 * falls back to mailbox. On success, writes a session cookie and redirects.
 */
export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const username = parsed.data.username.toLowerCase().trim();
  const password = parsed.data.password;

  // 1) Admin login
  const [adminRow] = await db
    .select()
    .from(admin)
    .where(and(eq(admin.username, username), eq(admin.active, 1)))
    .limit(1);

  if (adminRow && (await verifyPassword(password, adminRow.password))) {
    // Determine whether they're a superadmin. We check BOTH the `superadmin`
    // column (preferred) and a `domain='ALL'` row in domain_admins for
    // backwards compat with older phppostfixadmin DBs.
    let role: SessionRole = adminRow.superadmin === 1 ? 'superadmin' : 'admin';
    if (role !== 'superadmin') {
      const [allRow] = await db
        .select()
        .from(domainAdmins)
        .where(
          and(
            eq(domainAdmins.username, adminRow.username),
            eq(domainAdmins.domain, 'ALL'),
            eq(domainAdmins.active, 1),
          ),
        )
        .limit(1);
      if (allRow) role = 'superadmin';
    }

    await createSession(adminRow.username, role);
    await audit(adminRow.username, '', 'login', 'admin');
    redirect('/dashboard');
  }

  // 2) Mailbox user login
  const [mailboxRow] = await db
    .select()
    .from(mailbox)
    .where(and(eq(mailbox.username, username), eq(mailbox.active, 1)))
    .limit(1);

  if (mailboxRow && (await verifyPassword(password, mailboxRow.password))) {
    await createSession(mailboxRow.username, 'user');
    await audit(mailboxRow.username, mailboxRow.domain, 'login', 'user');
    redirect('/me');
  }

  return { error: 'Invalid username or password.' };
}

export async function logoutAction(_formData?: FormData): Promise<void> {
  await destroySession();
  redirect('/login');
}
