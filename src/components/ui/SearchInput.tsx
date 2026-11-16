import { useId } from 'react';
import { IconButton } from './IconButton';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}

export function SearchInput({ value, onChange, label, placeholder }: SearchInputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className="min-h-tap w-full appearance-none rounded-control border border-border bg-surface-2 pl-3 pr-12 text-[max(16px,1rem)] text-primary placeholder:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value !== '' && (
          <IconButton
            aria-label="Clear search"
            className="absolute right-0 top-0"
            onClick={() => {
              onChange('');
            }}
          >
            <span aria-hidden="true">×</span>
          </IconButton>
        )}
      </div>
    </div>
  );
}
