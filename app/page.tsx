import { redirect } from 'next/navigation';

import { readSession } from '@/lib/auth/session';

export default async function RootRedirect() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role === 'user') redirect('/me');
  redirect('/dashboard');
}
