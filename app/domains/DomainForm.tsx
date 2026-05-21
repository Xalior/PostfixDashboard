'use client';

import { useActionState } from 'react';
import { Alert, Button, Col, Form, Row, Spinner } from 'react-bootstrap';

import type { DomainActionState } from '@/lib/actions/domain';

interface Props {
  mode: 'create' | 'edit';
  action: (
    prev: DomainActionState | undefined,
    formData: FormData,
  ) => Promise<DomainActionState>;
  initial?: {
    domain?: string;
    description?: string;
    aliases?: number;
    mailboxes?: number;
    maxquotaMb?: number;
    quotaMb?: number;
    transport?: string;
    backupmx?: boolean;
    active?: boolean;
  };
  defaults: {
    aliases: number;
    mailboxes: number;
    maxquotaMb: number;
    quotaMb: number;
  };
}

export function DomainForm({ mode, action, initial, defaults }: Props) {
  const [state, formAction, pending] = useActionState<DomainActionState | undefined, FormData>(
    action,
    undefined,
  );
  const v = initial ?? {};

  return (
    <Form action={formAction}>
      {state?.error && <Alert variant="danger">{state.error}</Alert>}

      <div className="form-section">
        <h2>Domain</h2>
        <Row className="g-3">
          <Col md={6}>
            <Form.Group controlId="domain-name">
              <Form.Label>Domain name</Form.Label>
              <Form.Control
                type="text"
                name="domain"
                required
                placeholder="example.com"
                defaultValue={v.domain ?? ''}
                readOnly={mode === 'edit'}
              />
              <Form.Text>Must be a valid DNS domain. Cannot be changed after creation.</Form.Text>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="domain-description">
              <Form.Label>Description</Form.Label>
              <Form.Control
                type="text"
                name="description"
                defaultValue={v.description ?? ''}
                placeholder="Optional display name"
              />
            </Form.Group>
          </Col>
        </Row>
      </div>

      <div className="form-section">
        <h2>Limits</h2>
        <Row className="g-3">
          <Col md={3}>
            <Form.Group controlId="domain-mailboxes">
              <Form.Label>Max mailboxes</Form.Label>
              <Form.Control
                type="number"
                min={0}
                name="mailboxes"
                defaultValue={v.mailboxes ?? defaults.mailboxes}
              />
              <Form.Text>0 = unlimited</Form.Text>
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group controlId="domain-aliases">
              <Form.Label>Max aliases</Form.Label>
              <Form.Control
                type="number"
                min={0}
                name="aliases"
                defaultValue={v.aliases ?? defaults.aliases}
              />
              <Form.Text>0 = unlimited</Form.Text>
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group controlId="domain-maxquota">
              <Form.Label>Max mailbox quota (MB)</Form.Label>
              <Form.Control
                type="number"
                min={0}
                name="maxquotaMb"
                defaultValue={v.maxquotaMb ?? defaults.maxquotaMb}
              />
              <Form.Text>Per-mailbox ceiling</Form.Text>
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group controlId="domain-quota">
              <Form.Label>Domain quota (MB)</Form.Label>
              <Form.Control
                type="number"
                min={0}
                name="quotaMb"
                defaultValue={v.quotaMb ?? defaults.quotaMb}
              />
              <Form.Text>Sum across all mailboxes</Form.Text>
            </Form.Group>
          </Col>
        </Row>
      </div>

      <div className="form-section">
        <h2>Postfix</h2>
        <Row className="g-3">
          <Col md={6}>
            <Form.Group controlId="domain-transport">
              <Form.Label>Transport</Form.Label>
              <Form.Control
                type="text"
                name="transport"
                defaultValue={v.transport ?? 'virtual'}
                placeholder="virtual"
              />
              <Form.Text>Leave as <code>virtual</code> unless you know otherwise.</Form.Text>
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Check
              type="switch"
              id="domain-backupmx"
              name="backupmx"
              label="Backup MX"
              defaultChecked={v.backupmx ?? false}
              className="mt-4"
            />
          </Col>
          <Col md={3}>
            <Form.Check
              type="switch"
              id="domain-active"
              name="active"
              label="Active"
              defaultChecked={v.active ?? true}
              className="mt-4"
            />
          </Col>
        </Row>
      </div>

      <div className="d-flex gap-2 mt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending && <Spinner size="sm" animation="border" className="me-2" />}
          {mode === 'create' ? 'Create domain' : 'Save changes'}
        </Button>
      </div>
    </Form>
  );
}
