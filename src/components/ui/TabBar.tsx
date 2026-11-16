import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

interface TabDef {
  to: string;
  label: string;
  icon: ReactNode;
}

const svgProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const tabs: TabDef[] = [
  {
    to: '/',
    label: 'Workout',
    icon: (
      <svg {...svgProps}>
        <path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" />
      </svg>
    ),
  },
  {
    to: '/history',
    label: 'History',
    icon: (
      <svg {...svgProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    to: '/progress',
    label: 'Progress',
    icon: (
      <svg {...svgProps}>
        <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
      </svg>
    ),
  },
  {
    to: '/exercises',
    label: 'Exercises',
    icon: (
      <svg {...svgProps}>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
];

export function TabBar() {
  return (
    <nav
      aria-label="Main"
      data-hide-on-keyboard
      className="pb-safe pl-safe pr-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface"
    >
      <ul className="flex">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-caption font-medium ${
                  isActive ? 'text-accent' : 'text-secondary'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {tab.icon}
                  <span className={isActive ? 'underline underline-offset-4' : ''}>
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
