'use client';

import { useActionState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';

import { loginAction, type LoginState } from '@/lib/auth/login-action';

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <Form action={formAction} noValidate>
      {state?.error && (
        <Alert variant="danger" className="py-2">
          {state.error}
        </Alert>
      )}

      <Form.Group className="mb-3" controlId="login-username">
        <Form.Label>Email address</Form.Label>
        <Form.Control
          type="email"
          name="username"
          autoComplete="username"
          placeholder="you@example.com"
          autoFocus
          required
        />
      </Form.Group>

      <Form.Group className="mb-3" controlId="login-password">
        <Form.Label>Password</Form.Label>
        <Form.Control
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </Form.Group>

      <Button type="submit" variant="primary" className="w-100" disabled={pending}>
        {pending ? (
          <>
            <Spinner animation="border" size="sm" className="me-2" /> Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </Button>
    </Form>
  );
}
