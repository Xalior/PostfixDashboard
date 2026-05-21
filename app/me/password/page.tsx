import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/ui/PageHeader';

import { PasswordForm } from './PasswordForm';

export const metadata = { title: 'Change password' };

export default function ChangePasswordPage() {
  return (
    <AppShell>
      <PageHeader title="Change password" icon="bi-key" />
      <div className="card shadow-sm border-0" style={{ maxWidth: 520 }}>
        <div className="card-body">
          <PasswordForm />
        </div>
      </div>
    </AppShell>
  );
}
