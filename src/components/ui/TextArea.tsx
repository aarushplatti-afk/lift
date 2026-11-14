import { useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  error?: string;
}

export function TextArea({ label, error, className = '', ...rest }: TextAreaProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-sm font-medium text-secondary">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : undefined}
        className={`min-h-[96px] rounded-control border bg-surface-2 px-3 py-2 text-[16px] text-primary placeholder:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          error !== undefined ? 'border-danger' : 'border-border'
        } ${className}`}
        {...rest}
      />
      <div className="flex justify-between gap-2">
        {error !== undefined ? (
          <p id={errorId} role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        ) : (
          <span />
        )}
        {rest.maxLength !== undefined && typeof rest.value === 'string' && (
          <span className="text-caption tabular-nums text-secondary">
            {rest.value.length}/{rest.maxLength}
          </span>
        )}
      </div>
    </div>
  );
}
