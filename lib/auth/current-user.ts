import 'server-only';

import { cache } from 'react';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { admin, domainAdmins, mailbox } from '@/lib/db/schema';
import { readSession, type SessionPayload } from './session';

/**
 * Resolve the logged-in user into a full context object: which row backs
 * them, what domains they can manage (if any), and whether they're super.
 *
 * Cached per request via React's `cache()` so multiple RSCs in the same
 * render can call it without hammering the DB.
 */

export interface AdminContext {
  session: SessionPayload;
  kind: 'admin';
  username: string;
  isSuperadmin: boolean;
  /** List of domains this admin can manage. Superadmins get `null` = all. */
  allowedDomains: string[] | null;
}

export interface UserContext {
  session: SessionPayload;
  kind: 'user';
  username: string;
  domain: string;
  displayName: string;
  quotaBytes: number;
}

export type CurrentUser = AdminContext | UserContext;

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;

  if (session.role === 'user') {
    const [row] = await db
      .select()
      .from(mailbox)
      .where(and(eq(mailbox.username, session.sub), eq(mailbox.active, 1)))
      .limit(1);
    if (!row) return null;
    return {
      session,
      kind: 'user',
      username: row.username,
      domain: row.domain,
      displayName: row.name,
      quotaBytes: Number(row.quota),
    };
  }

  const [row] = await db
    .select()
    .from(admin)
    .where(and(eq(admin.username, session.sub), eq(admin.active, 1)))
    .limit(1);
  if (!row) return null;

  // Authoritative super-status from the DB only — NOT the (possibly stale)
  // session role — so demoting a superadmin takes effect on the next request,
  // matching the immediacy of deactivation. Back-compat: an active
  // domain='ALL' row also confers super (older phppostfixadmin installs).
  const grantRows = await db
    .select({ domain: domainAdmins.domain })
    .from(domainAdmins)
    .where(and(eq(domainAdmins.username, row.username), eq(domainAdmins.active, 1)));
  const hasAllRow = grantRows.some((r) => r.domain === 'ALL');
  const isSuperadmin = row.superadmin === 1 || hasAllRow;

  const allowedDomains: string[] | null = isSuperadmin
    ? null
    : grantRows.map((r) => r.domain).filter((d) => d !== 'ALL');

  return {
    session,
    kind: 'admin',
    username: row.username,
    isSuperadmin,
    allowedDomains,
  };
});

/** True if this admin may touch rows under the given domain. */
export function canAccessDomain(user: CurrentUser | null, d: string): boolean {
  if (!user) return false;
  if (user.kind === 'user') return user.domain === d;
  if (user.isSuperadmin) return true;
  return (user.allowedDomains ?? []).includes(d);
}
