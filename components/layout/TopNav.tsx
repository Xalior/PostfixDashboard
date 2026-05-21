'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Container, Nav, Navbar, NavDropdown } from 'react-bootstrap';

import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { logoutAction } from '@/lib/auth/login-action';

export interface TopNavProps {
  brand: string;
  username: string;
  role: 'superadmin' | 'admin' | 'user';
  /** Number of domains this admin can manage (undefined for superadmin/user). */
  domainCount?: number;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: Array<'superadmin' | 'admin' | 'user'>;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'bi-speedometer2', roles: ['superadmin', 'admin'] },
  { href: '/domains', label: 'Domains', icon: 'bi-globe2', roles: ['superadmin', 'admin'] },
  { href: '/mailboxes', label: 'Mailboxes', icon: 'bi-person-lines-fill', roles: ['superadmin', 'admin'] },
  { href: '/aliases', label: 'Aliases', icon: 'bi-arrow-left-right', roles: ['superadmin', 'admin'] },
  { href: '/alias-domains', label: 'Alias Domains', icon: 'bi-diagram-3', roles: ['superadmin', 'admin'] },
  { href: '/admins', label: 'Admins', icon: 'bi-shield-lock', roles: ['superadmin'] },
  { href: '/logs', label: 'Logs', icon: 'bi-clock-history', roles: ['superadmin', 'admin'] },
];

export function TopNav({ brand, username, role }: TopNavProps) {
  const pathname = usePathname();

  return (
    <Navbar expand="lg" className="app-navbar" sticky="top">
      <Container fluid="xl">
        <Navbar.Brand as={Link} href={role === 'user' ? '/me' : '/dashboard'}>
          <i className="bi bi-envelope-at-fill text-primary me-2" aria-hidden="true" />
          <strong>{brand}</strong>
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="top-nav" />
        <Navbar.Collapse id="top-nav">
          <Nav className="me-auto">
            {NAV.filter((n) => n.roles.includes(role)).map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Nav.Link
                  as={Link}
                  key={item.href}
                  href={item.href}
                  active={active}
                  className="d-flex align-items-center gap-1"
                >
                  <i className={`bi ${item.icon}`} aria-hidden="true" />
                  {item.label}
                </Nav.Link>
              );
            })}
          </Nav>

          <div className="d-flex align-items-center gap-2">
            <ThemeToggle />
            <NavDropdown
              align="end"
              id="user-menu"
              title={
                <span>
                  <i className="bi bi-person-circle me-1" aria-hidden="true" />
                  <span className="d-none d-md-inline">{username}</span>
                </span>
              }
            >
              <NavDropdown.ItemText className="small text-body-secondary">
                Signed in as <strong>{username}</strong>
                <br />
                <span className="text-capitalize">{role}</span>
              </NavDropdown.ItemText>
              <NavDropdown.Divider />
              {role === 'user' && (
                <>
                  <NavDropdown.Item as={Link} href="/me">
                    My mailbox
                  </NavDropdown.Item>
                  <NavDropdown.Item as={Link} href="/me/password">
                    Change password
                  </NavDropdown.Item>
                </>
              )}
              <NavDropdown.Item
                as="button"
                onClick={() => {
                  void logoutAction();
                }}
              >
                <i className="bi bi-box-arrow-right me-2" aria-hidden="true" />
                Sign out
              </NavDropdown.Item>
            </NavDropdown>
          </div>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
