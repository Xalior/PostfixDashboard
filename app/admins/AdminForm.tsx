'use client';

import { useActionState, useState } from 'react';
import { Alert, Button, Col, Form, Row, Spinner } from 'react-bootstrap';

import type { AdminActionState } from '@/lib/actions/admin';

interface Props {
  mode: 'create' | 'edit';
  action: (
    prev: AdminActionState | undefined,
    formData: FormData,
  ) => Promise<AdminActionState>;
  availableDomains: string[];
  initial?: {
    username?: string;
    superadmin?: boolean;
    active?: boolean;
    domains?: string[];
  };
}

export function AdminForm({ mode, action, availableDomains, initial }: Props) {
  const [state, formAction, pending] = useActionState<AdminActionState | undefined, FormData>(
    action,
    undefined,
  );
  const v = initial ?? {};
  const [isSuper, setIsSuper] = useState(v.superadmin ?? false);

  return (
    <Form action={formAction}>
      {state?.error && <Alert variant="danger">{state.error}</Alert>}

      <div className="form-section">
        <h2>Account</h2>
        <Row className="g-3">
          <Col md={6}>
            <Form.Group controlId="ad-username">
              <Form.Label>Email (used as username)</Form.Label>
              <Form.Control
                type="email"
                name="username"
                required
                placeholder="admin@example.com"
                defaultValue={v.username ?? ''}
                readOnly={mode === 'edit'}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="ad-password">
              <Form.Label>{mode === 'create' ? 'Password' : 'New password'}</Form.Label>
              <Form.Control
                type="password"
                name="password"
                required={mode === 'create'}
                autoComplete="new-password"
                placeholder={mode === 'edit' ? 'Leave blank to keep existing' : ''}
              />
            </Form.Group>
          </Col>
        </Row>
      </div>

      <div className="form-section">
        <h2>Role</h2>
        <Form.Check
          type="switch"
          id="ad-super"
          name="superadmin"
          label="Superadmin (full access)"
          defaultChecked={v.superadmin ?? false}
          onChange={(e) => setIsSuper((e.target as HTMLInputElement).checked)}
        />
        <Form.Check
          type="switch"
          id="ad-active"
          name="active"
          label="Active"
          defaultChecked={v.active ?? true}
          className="mt-2"
        />
      </div>

      {!isSuper && (
        <div className="form-section">
          <h2>Managed domains</h2>
          <p className="text-body-secondary small">
            Domain admins can only see and edit mailboxes/aliases in the domains selected here.
          </p>
          <div className="row g-2">
            {availableDomains.length === 0 && (
              <div className="col-12 text-body-secondary">
                No domains exist yet. Create one first.
              </div>
            )}
            {availableDomains.map((d) => (
              <div className="col-md-4" key={d}>
                <Form.Check
                  type="checkbox"
                  id={`ad-dom-${d}`}
                  name="domains"
                  value={d}
                  label={d}
                  defaultChecked={(v.domains ?? []).includes(d)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <Button type="submit" variant="primary" className="mt-4" disabled={pending}>
        {pending && <Spinner size="sm" animation="border" className="me-2" />}
        {mode === 'create' ? 'Create admin' : 'Save changes'}
      </Button>
    </Form>
  );
}
