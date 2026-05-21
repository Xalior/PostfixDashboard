'use client';

import { useActionState } from 'react';
import { Alert, Button, Col, Form, InputGroup, Row, Spinner } from 'react-bootstrap';

import type { AliasActionState } from '@/lib/actions/alias';

interface Props {
  mode: 'create' | 'edit';
  action: (
    prev: AliasActionState | undefined,
    formData: FormData,
  ) => Promise<AliasActionState>;
  availableDomains?: string[];
  initial?: {
    address?: string;
    localpart?: string;
    domain?: string;
    goto?: string;
    active?: boolean;
  };
}

export function AliasForm({ mode, action, availableDomains = [], initial }: Props) {
  const [state, formAction, pending] = useActionState<AliasActionState | undefined, FormData>(
    action,
    undefined,
  );
  const v = initial ?? {};

  return (
    <Form action={formAction}>
      {state?.error && <Alert variant="danger">{state.error}</Alert>}

      <div className="form-section">
        <h2>Address</h2>
        {mode === 'edit' ? (
          <Form.Group controlId="alias-address">
            <Form.Label>Alias address</Form.Label>
            <Form.Control type="text" value={v.address ?? ''} readOnly />
          </Form.Group>
        ) : (
          <Row className="g-3">
            <Col md={8}>
              <Form.Group controlId="alias-localpart">
                <Form.Label>Local part</Form.Label>
                <InputGroup>
                  <Form.Control
                    type="text"
                    placeholder="support"
                    name="localpart"
                    required
                    defaultValue={v.localpart ?? ''}
                  />
                  <InputGroup.Text>@</InputGroup.Text>
                  <Form.Select
                    name="domain"
                    required
                    defaultValue={v.domain ?? availableDomains[0] ?? ''}
                  >
                    {availableDomains.length === 0 && <option value="">No domains available</option>}
                    {availableDomains.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Form.Select>
                </InputGroup>
                <Form.Text>Full address: local-part + @ + selected domain.</Form.Text>
              </Form.Group>
            </Col>
          </Row>
        )}
      </div>

      <div className="form-section">
        <h2>Forward to</h2>
        <Form.Group controlId="alias-goto">
          <Form.Label>Recipients</Form.Label>
          <Form.Control
            as="textarea"
            name="goto"
            rows={4}
            required
            placeholder={'alice@example.com\nbob@example.com'}
            defaultValue={v.goto ?? ''}
          />
          <Form.Text>One email address per line (commas also accepted).</Form.Text>
        </Form.Group>
      </div>

      <div className="form-section">
        <h2>State</h2>
        <Form.Check
          type="switch"
          id="alias-active"
          name="active"
          label="Active"
          defaultChecked={v.active ?? true}
        />
      </div>

      <div className="d-flex gap-2 mt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending && <Spinner size="sm" animation="border" className="me-2" />}
          {mode === 'create' ? 'Create alias' : 'Save changes'}
        </Button>
      </div>
    </Form>
  );
}
