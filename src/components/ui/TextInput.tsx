import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
}

export function TextInput({ label, className = '', ...rest }: TextInputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-sm font-medium text-secondary">
        {label}
      </label>
      <input
        id={id}
        className={`min-h-tap rounded-control border border-border bg-surface-2 px-3 text-[16px] text-primary placeholder:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${className}`}
        {...rest}
      />
    </div>
  );
}
