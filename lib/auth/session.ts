import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';

import { env } from '@/lib/env';

/**
 * Cookie-backed session using a signed JWT.
 *
 * We intentionally keep the session payload tiny — just enough for role
 * checks — and re-fetch the user row on each request that needs it, so
 * revocation (e.g., deactivating an admin) takes effect immediately.
 */

export type SessionRole = 'superadmin' | 'admin' | 'user';

export interface SessionPayload {
  /** admin.username or mailbox.username */
  sub: string;
  /** superadmin | admin (domain admin) | user (mailbox user) */
  role: SessionRole;
  /** iat — seconds */
  iat: number;
  /** exp — seconds */
  exp: number;
}

const secretKey = () => new TextEncoder().encode(env.session.secret);

export async function createSession(
  sub: string,
  role: SessionRole,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + env.session.maxAgeSec;

  const jwt = await new SignJWT({ sub, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set(env.session.cookieName, jwt, {
    httpOnly: true,
    secure: env.session.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: env.session.maxAgeSec,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(env.session.cookieName);
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.session.cookieName)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.sub !== 'string' ||
      (payload.role !== 'superadmin' && payload.role !== 'admin' && payload.role !== 'user')
    ) {
      return null;
    }
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route guards — used inside server components / server actions.
// ---------------------------------------------------------------------------

export async function requireSession(): Promise<SessionPayload> {
  const s = await readSession();
  if (!s) redirect('/login');
  return s;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const s = await requireSession();
  if (s.role === 'user') redirect('/me');
  return s;
}

export async function requireSuperadmin(): Promise<SessionPayload> {
  const s = await requireSession();
  if (s.role !== 'superadmin') {
    // Domain admin hit a superadmin-only page.
    redirect('/dashboard');
  }
  return s;
}
