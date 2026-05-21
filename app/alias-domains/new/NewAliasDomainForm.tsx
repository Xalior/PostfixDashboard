'use client';

import { useActionState } from 'react';
import { Alert, Button, Col, Form, Row, Spinner } from 'react-bootstrap';

import { createAliasDomainAction, type AliasActionState } from '@/lib/actions/alias';

interface Props {
  targets: string[];
}

export function NewAliasDomainForm({ targets }: Props) {
  const [state, formAction, pending] = useActionState<AliasActionState | undefined, FormData>(
    createAliasDomainAction,
    undefined,
  );

  return (
    <Form action={formAction}>
      {state?.error && <Alert variant="danger">{state.error}</Alert>}

      <Row className="g-3">
        <Col md={6}>
          <Form.Group controlId="ad-alias">
            <Form.Label>Alias domain</Form.Label>
            <Form.Control
              type="text"
              name="aliasDomain"
              required
              placeholder="example.net"
            />
            <Form.Text>The domain that should behave like the target.</Form.Text>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group controlId="ad-target">
            <Form.Label>Target domain</Form.Label>
            <Form.Select name="targetDomain" required>
              {targets.length === 0 && <option value="">No domains available</option>}
              {targets.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      <Form.Check
        type="switch"
        id="ad-active"
        name="active"
        label="Active"
        defaultChecked
        className="mt-3"
      />

      <Button type="submit" variant="primary" className="mt-4" disabled={pending}>
        {pending && <Spinner size="sm" animation="border" className="me-2" />}
        Create alias domain
      </Button>
    </Form>
  );
}
