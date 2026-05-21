'use server';

import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { audit } from '@/lib/audit';
import { db } from '@/lib/db';
import { admin, domainAdmins, mailbox } from '@/lib/db/schema';
import { verifyPassword } from './password';
import { createSession, destroySession, type SessionRole } from './session';

// A real bcrypt hash used only to spend ~the same CPU verifying a password
// when the account doesn't exist, so response time doesn't reveal whether a
// username is valid (account-enumeration defence). Matches no real password.
const DUMMY_PASSWORD_HASH =
  '{BLF-CRYPT}$2a$12$5mu4/sfArvEMtiafmmZYMOMuqhqdEJcv77kLqPtpUMrFBAx5CwZdu';

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

  // Neither table had this account: spend a comparable amount of CPU on a
  // dummy verify so an unknown username isn't measurably faster than a known
  // one with a wrong password.
  if (!adminRow && !mailboxRow) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
  }

  return { error: 'Invalid username or password.' };
}

export async function logoutAction(_formData?: FormData): Promise<void> {
  await destroySession();
  redirect('/login');
}
