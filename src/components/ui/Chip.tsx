import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

const CHIP_BASE =
  'min-h-tap shrink-0 whitespace-nowrap rounded-full border px-4 text-body-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const CHIP_ON = 'border-accent bg-accent text-on-accent';
const CHIP_OFF = 'border-border bg-surface-2 text-secondary';

interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function Chip({ selected, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`${CHIP_BASE} ${selected ? CHIP_ON : CHIP_OFF}`}
    >
      {children}
    </button>
  );
}

interface ChipOption<T extends string> {
  value: T | 'all';
  label: string;
}

interface ChipGroupProps<T extends string> {
  label: string;
  options: readonly ChipOption<T>[];
  value: T | 'all';
  onChange: (value: T | 'all') => void;
}

export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: ChipGroupProps<T>) {
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
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
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
            className={`${CHIP_BASE} ${selected ? CHIP_ON : CHIP_OFF}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
