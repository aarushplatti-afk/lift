import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  error?: string;
}

export function Select({ label, error, className = '', children, ...rest }: SelectProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-sm font-medium text-secondary">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : undefined}
        className={`min-h-tap rounded-control border bg-surface-2 px-3 text-[max(16px,1rem)] text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          error !== undefined ? 'border-danger' : 'border-border'
        } ${className}`}
        {...rest}
      >
        {children}
      </select>
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
