import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (index - 1 + options.length) % options.length;
    else return;
    e.preventDefault();
    const opt = options[next];
    if (opt) onChange(opt.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-control border border-border bg-surface-2 p-0.5"
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(opt.value);
            }}
            onKeyDown={(e) => {
              onKeyDown(e, i);
            }}
            className={`min-h-tap flex-1 rounded-control px-3 text-body font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
              selected ? 'bg-accent text-on-accent' : 'text-secondary'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
