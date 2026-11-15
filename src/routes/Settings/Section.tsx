import type { ReactNode } from 'react';
import { Card } from '../../components/ui/Card';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="px-1 text-caption font-semibold uppercase text-secondary">{title}</h2>
      <Card className="flex flex-col gap-4">{children}</Card>
    </section>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-body">
      <span className="text-secondary">{label}</span>
      <span className="min-w-0 break-words text-right tabular-nums">{value}</span>
    </div>
  );
}
