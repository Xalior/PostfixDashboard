'use client';

import { Dropdown } from 'react-bootstrap';

import { useTheme, type ThemeMode } from './ThemeProvider';

const OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'bi-sun-fill' },
  { value: 'dark', label: 'Dark', icon: 'bi-moon-stars-fill' },
  { value: 'system', label: 'System', icon: 'bi-circle-half' },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const current = OPTIONS.find((o) => o.value === mode) ?? OPTIONS[2];

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="outline-secondary"
        size="sm"
        id="theme-toggle"
        aria-label={`Change theme (current: ${current.label})`}
      >
        <i className={`bi ${current.icon}`} aria-hidden="true" />
        <span className="visually-hidden">Theme: {current.label}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu>
        {OPTIONS.map((opt) => (
          <Dropdown.Item
            key={opt.value}
            active={opt.value === mode}
            onClick={() => setMode(opt.value)}
          >
            <i className={`bi ${opt.icon} me-2`} aria-hidden="true" />
            {opt.label}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
