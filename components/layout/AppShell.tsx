import type { ReactNode } from 'react';

import { TopNav } from './TopNav';
import { env } from '@/lib/env';
import { getCurrentUser } from '@/lib/auth/current-user';
import { redirect } from 'next/navigation';

interface AppShellProps {
  children: ReactNode;
  /** If true, only admins (any flavour) may render. */
  requireAdmin?: boolean;
  /** If true, only superadmins may render. */
  requireSuperadmin?: boolean;
  /** If true, only mailbox users may render. */
  requireUser?: boolean;
}

/**
 * Server component shell: resolves the current user, enforces the required
 * role, and wraps children in the standard nav/footer chrome.
 */
export async function AppShell({
  children,
  requireAdmin = false,
  requireSuperadmin = false,
  requireUser = false,
}: AppShellProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (requireUser && user.kind !== 'user') redirect('/dashboard');
  if ((requireAdmin || requireSuperadmin) && user.kind !== 'admin') redirect('/me');
  if (requireSuperadmin && user.kind === 'admin' && !user.isSuperadmin) redirect('/dashboard');

  const role: 'superadmin' | 'admin' | 'user' =
    user.kind === 'user' ? 'user' : user.isSuperadmin ? 'superadmin' : 'admin';

  return (
    <>
      <TopNav brand={env.brand.name} username={user.username} role={role} />
      <main className="app-main">
        <div className="container-xl">{children}</div>
      </main>
      <footer className="app-footer text-center">
        <div className="container-xl">
          {env.brand.name} · compatible with phppostfixadmin databases
        </div>
      </footer>
    </>
  );
}
