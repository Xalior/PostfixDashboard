'use client';

import { useActionState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';

import { changeOwnPasswordAction, type UserActionState } from '@/lib/actions/user';

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<UserActionState | undefined, FormData>(
    changeOwnPasswordAction,
    undefined,
  );
  return (
    <Form action={formAction}>
      {state?.error && <Alert variant="danger">{state.error}</Alert>}
      {state?.success && <Alert variant="success">{state.success}</Alert>}

      <Form.Group className="mb-3" controlId="pw-current">
        <Form.Label>Current password</Form.Label>
        <Form.Control type="password" name="current" autoComplete="current-password" required />
      </Form.Group>

      <Form.Group className="mb-3" controlId="pw-next">
        <Form.Label>New password</Form.Label>
        <Form.Control type="password" name="next" autoComplete="new-password" required minLength={8} />
        <Form.Text>At least 8 characters.</Form.Text>
      </Form.Group>

      <Form.Group className="mb-3" controlId="pw-confirm">
        <Form.Label>Confirm new password</Form.Label>
        <Form.Control type="password" name="confirm" autoComplete="new-password" required minLength={8} />
      </Form.Group>

      <Button type="submit" variant="primary" disabled={pending}>
        {pending && <Spinner size="sm" animation="border" className="me-2" />}
        Update password
      </Button>
    </Form>
  );
}
