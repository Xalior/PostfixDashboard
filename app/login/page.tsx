import { redirect } from 'next/navigation';

import { LoginForm } from './LoginForm';
import { readSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export const metadata = {
  title: 'Sign in',
};

export default async function LoginPage() {
  const session = await readSession();
  if (session) {
    redirect(session.role === 'user' ? '/me' : '/dashboard');
  }

  return (
    <div className="d-flex flex-column min-vh-100">
      <header className="app-navbar py-2">
        <div className="container-xl d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-envelope-at-fill text-primary fs-4" aria-hidden="true" />
            <strong>{env.brand.name}</strong>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="app-main d-flex align-items-center justify-content-center">
        <div className="container-xl" style={{ maxWidth: 440 }}>
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <h1 className="h4 mb-1">Sign in</h1>
              <p className="text-body-secondary mb-4">
                Use your mailbox or administrator credentials.
              </p>
              <LoginForm />
            </div>
          </div>
          <p className="text-center text-body-secondary small mt-3 mb-0">
            Having trouble? Contact your mail administrator.
          </p>
        </div>
      </main>

      <footer className="app-footer text-center">
        <div className="container-xl">
          {env.brand.name} · open source · MySQL-compatible with phppostfixadmin
        </div>
      </footer>
    </div>
  );
}
