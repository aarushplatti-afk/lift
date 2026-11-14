import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface ListRowProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  to?: string;
  onClick?: () => void;
  checked?: boolean;
  dimmed?: boolean;
}

const ROW =
  'flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:bg-surface-2';

export function ListRow({
  title,
  subtitle,
  trailing,
  to,
  onClick,
  checked,
  dimmed = false,
}: ListRowProps) {
  const isCheckbox = checked !== undefined;
  const className = `${ROW} ${dimmed ? 'opacity-60' : ''}`;
  const content = (
    <>
      {isCheckbox && (
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-control border text-caption font-bold ${
            checked ? 'border-accent bg-accent text-on-accent' : 'border-border text-transparent'
          }`}
        >
          ✓
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body text-primary">{title}</span>
        {subtitle !== undefined && (
          <span className="truncate text-body-sm text-secondary">{subtitle}</span>
        )}
      </span>
      {trailing !== undefined && (
        <span className="shrink-0 text-body-sm tabular-nums text-secondary">{trailing}</span>
      )}
    </>
  );

  if (to !== undefined) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      role={isCheckbox ? 'checkbox' : undefined}
      aria-checked={isCheckbox ? checked : undefined}
    >
      {content}
    </button>
  );
}
