'use client';

import { useActionState } from 'react';
import { Alert, Button, Col, Form, Row, Spinner } from 'react-bootstrap';

import { updateOwnVacationAction, type UserActionState } from '@/lib/actions/user';

interface Props {
  initial?: {
    subject: string;
    body: string;
    activeFrom: string;
    activeUntil: string;
    active: boolean;
  };
}

export function VacationForm({ initial }: Props) {
  const [state, formAction, pending] = useActionState<UserActionState | undefined, FormData>(
    updateOwnVacationAction,
    undefined,
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Form action={formAction}>
      {state?.error && <Alert variant="danger">{state.error}</Alert>}
      {state?.success && <Alert variant="success">{state.success}</Alert>}

      <Form.Group className="mb-3" controlId="vac-subject">
        <Form.Label>Subject</Form.Label>
        <Form.Control
          type="text"
          name="subject"
          required
          maxLength={255}
          defaultValue={initial?.subject ?? 'Out of office'}
        />
      </Form.Group>

      <Form.Group className="mb-3" controlId="vac-body">
        <Form.Label>Message</Form.Label>
        <Form.Control
          as="textarea"
          name="body"
          rows={6}
          required
          defaultValue={
            initial?.body ?? "Hi,\n\nI'm away at the moment and will reply when I return.\n\nThanks!"
          }
        />
      </Form.Group>

      <Row className="g-3">
        <Col md={6}>
          <Form.Group controlId="vac-from">
            <Form.Label>Active from</Form.Label>
            <Form.Control type="date" name="activeFrom" defaultValue={initial?.activeFrom ?? today} />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group controlId="vac-until">
            <Form.Label>Active until</Form.Label>
            <Form.Control
              type="date"
              name="activeUntil"
              defaultValue={initial?.activeUntil ?? today}
            />
          </Form.Group>
        </Col>
      </Row>

      <Form.Check
        type="switch"
        id="vac-active"
        name="active"
        label="Enabled"
        defaultChecked={initial?.active ?? false}
        className="mt-3"
      />

      <Button type="submit" variant="primary" className="mt-4" disabled={pending}>
        {pending && <Spinner size="sm" animation="border" className="me-2" />}
        Save autoreply
      </Button>
    </Form>
  );
}
