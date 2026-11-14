import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
}

export function TextInput({ label, error, className = '', ...rest }: TextInputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-sm font-medium text-secondary">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : undefined}
        className={`min-h-tap rounded-control border bg-surface-2 px-3 text-[16px] text-primary placeholder:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          error !== undefined ? 'border-danger' : 'border-border'
        } ${className}`}
        {...rest}
      />
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
