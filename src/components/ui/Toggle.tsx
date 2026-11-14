import { useId } from 'react';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ label, checked, onChange, description, disabled = false }: ToggleProps) {
  const labelId = useId();
  const descId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descId : undefined}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
      className="flex min-h-tap w-full items-center justify-between gap-3 rounded-control py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
    >
      <span className="flex min-w-0 flex-col">
        <span id={labelId} className="text-body text-primary">
          {label}
        </span>
        {description ? (
          <span id={descId} className="text-body-sm text-secondary">
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-border ${
          checked ? 'bg-accent' : 'bg-surface-2'
        }`}
      >
        <span
          className={`absolute left-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[14px] font-bold leading-none text-primary shadow-lg motion-safe:transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        >
          {checked ? '✓' : ''}
        </span>
      </span>
    </button>
  );
}
