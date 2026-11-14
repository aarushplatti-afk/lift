import { IconButton } from './IconButton';

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

export function Stepper({ label, value, min, max, step, format, onChange }: StepperProps) {
  return (
    <div role="group" aria-label={label} className="flex items-center justify-between gap-3">
      <span className="text-body text-primary">{label}</span>
      <div className="flex items-center gap-1">
        <IconButton
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => {
            onChange(Math.max(min, value - step));
          }}
          className="border border-border bg-surface-2 text-title-sm"
        >
          <span aria-hidden="true">−</span>
        </IconButton>
        <span
          aria-live="polite"
          className="min-w-[4.5rem] text-center text-body font-semibold tabular-nums text-primary"
        >
          {format(value)}
        </span>
        <IconButton
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => {
            onChange(Math.min(max, value + step));
          }}
          className="border border-border bg-surface-2 text-title-sm"
        >
          <span aria-hidden="true">+</span>
        </IconButton>
      </div>
    </div>
  );
}
