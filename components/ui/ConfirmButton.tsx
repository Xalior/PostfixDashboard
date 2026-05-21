'use client';

import { useState, useTransition } from 'react';
import { Button, Modal, Spinner } from 'react-bootstrap';

interface Props {
  label: string;
  title?: string;
  body?: string;
  confirmLabel?: string;
  variant?: string;
  size?: 'sm' | 'lg';
  icon?: string;
  action: () => Promise<void>;
}

/**
 * Thin client-side wrapper around a server action that first shows a
 * confirmation modal. Used for destructive operations (delete domain, etc.).
 */
export function ConfirmButton({
  label,
  title = 'Are you sure?',
  body = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  variant = 'danger',
  size,
  icon = 'bi-trash',
  action,
}: Props) {
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setShow(true)}
        disabled={pending}
        type="button"
      >
        <i className={`bi ${icon} me-1`} aria-hidden="true" />
        {label}
      </Button>
      <Modal show={show} onHide={() => setShow(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>{body}</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={variant}
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await action();
                setShow(false);
              });
            }}
          >
            {pending ? (
              <>
                <Spinner size="sm" animation="border" className="me-2" />
                Working…
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
