import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <h2 className="text-title-sm font-semibold">{title}</h2>
      <p className="text-body-sm text-secondary">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
