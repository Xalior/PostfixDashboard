'use client';

import { useActionState } from 'react';
import { Alert, Button, Col, Form, InputGroup, Row, Spinner } from 'react-bootstrap';

import type { MailboxActionState } from '@/lib/actions/mailbox';

interface Props {
  mode: 'create' | 'edit';
  action: (
    prev: MailboxActionState | undefined,
    formData: FormData,
  ) => Promise<MailboxActionState>;
  availableDomains: string[];
  initial?: {
    localpart?: string;
    domain?: string;
    name?: string;
    quotaMb?: number;
    active?: boolean;
  };
  defaultQuotaMb: number;
}

export function MailboxForm({ mode, action, availableDomains, initial, defaultQuotaMb }: Props) {
  const [state, formAction, pending] = useActionState<MailboxActionState | undefined, FormData>(
    action,
    undefined,
  );
  const v = initial ?? {};

  return (
    <Form action={formAction}>
      {state?.error && <Alert variant="danger">{state.error}</Alert>}

      <div className="form-section">
        <h2>Address</h2>
        <Row className="g-3">
          <Col md={6}>
            <Form.Group controlId="mb-localpart">
              <Form.Label>Local part</Form.Label>
              <InputGroup>
                <Form.Control
                  type="text"
                  name="localpart"
                  required
                  placeholder="jane"
                  defaultValue={v.localpart ?? ''}
                  readOnly={mode === 'edit'}
                />
                <InputGroup.Text>@</InputGroup.Text>
                {mode === 'edit' ? (
                  <>
                    <Form.Control type="text" value={v.domain ?? ''} readOnly />
                    <input type="hidden" name="domain" value={v.domain ?? ''} />
                  </>
                ) : (
                  <Form.Select name="domain" required defaultValue={v.domain ?? availableDomains[0] ?? ''}>
                    {availableDomains.length === 0 && <option value="">No domains available</option>}
                    {availableDomains.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Form.Select>
                )}
              </InputGroup>
              <Form.Text>The full address will be used as the mailbox username.</Form.Text>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="mb-name">
              <Form.Label>Display name</Form.Label>
              <Form.Control
                type="text"
                name="name"
                placeholder="Jane Doe"
                defaultValue={v.name ?? ''}
              />
            </Form.Group>
          </Col>
        </Row>
      </div>

      <div className="form-section">
        <h2>Password</h2>
        <Row className="g-3">
          <Col md={6}>
            <Form.Group controlId="mb-password">
              <Form.Label>{mode === 'create' ? 'Password' : 'New password'}</Form.Label>
              <Form.Control
                type="password"
                name="password"
                autoComplete="new-password"
                required={mode === 'create'}
                placeholder={mode === 'edit' ? 'Leave blank to keep existing' : ''}
              />
              <Form.Text>Minimum 8 characters. Hashed with the server&apos;s default scheme.</Form.Text>
            </Form.Group>
          </Col>
        </Row>
      </div>

      <div className="form-section">
        <h2>Quota &amp; state</h2>
        <Row className="g-3">
          <Col md={4}>
            <Form.Group controlId="mb-quota">
              <Form.Label>Quota (MB)</Form.Label>
              <Form.Control
                type="number"
                min={0}
                name="quotaMb"
                defaultValue={v.quotaMb ?? defaultQuotaMb}
              />
              <Form.Text>0 = unlimited (subject to domain maximum).</Form.Text>
            </Form.Group>
          </Col>
          <Col md={4} className="d-flex align-items-end">
            <Form.Check
              type="switch"
              id="mb-active"
              name="active"
              label="Active"
              defaultChecked={v.active ?? true}
            />
          </Col>
        </Row>
      </div>

      <div className="d-flex gap-2 mt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending && <Spinner size="sm" animation="border" className="me-2" />}
          {mode === 'create' ? 'Create mailbox' : 'Save changes'}
        </Button>
      </div>
    </Form>
  );
}
