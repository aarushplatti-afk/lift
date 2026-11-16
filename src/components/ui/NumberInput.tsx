import { forwardRef, useState } from 'react';
import type { ChangeEvent, FocusEvent } from 'react';

interface NumberInputProps {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  mode: 'decimal' | 'integer' | 'duration';
  format: (v: number) => string;
  parse: (raw: string) => number | undefined;
  'aria-label': string;
  invalid?: boolean;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}

function sanitize(raw: string, mode: NumberInputProps['mode']): string {
  if (mode === 'integer') return raw.replace(/\D/g, '');
  if (mode === 'duration') return raw.replace(/[^\d:]/g, '');
  return raw;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onCommit, mode, format, parse, invalid = false, maxLength, className = '', ...rest },
  ref,
) {
  const [draft, setDraft] = useState<string | null>(null);

  const shown = draft ?? (value === undefined ? '' : format(value));

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    setDraft(value === undefined ? '' : format(value));
    e.currentTarget.select();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = sanitize(e.target.value, mode);
    setDraft(raw);
    if (raw.trim() === '') {
      onCommit(undefined);
      return;
    }
    const parsed = parse(raw);
    if (parsed !== undefined) onCommit(parsed);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode={mode === 'decimal' ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={shown}
      maxLength={maxLength}
      placeholder={rest.placeholder}
      aria-label={rest['aria-label']}
      aria-invalid={invalid}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={() => {
        setDraft(null);
      }}
      className={`h-11 min-w-0 rounded-control border bg-surface-2 px-1 text-center text-[max(16px,1rem)] tabular-nums text-primary placeholder:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
        invalid ? 'border-danger' : 'border-transparent'
      } ${className}`}
    />
  );
});
