import type { ReactNode } from 'react';

interface HeaderProps {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
}

export function Header({ title, left, right }: HeaderProps) {
  return (
    <header className="pt-safe pl-safe pr-safe sticky top-0 z-10 border-b border-border bg-bg">
      <div className="flex min-h-[52px] items-center gap-2 px-2">
        <div className="flex min-w-tap justify-start">{left}</div>
        <h1 className="flex-1 truncate text-center text-title-sm font-semibold">{title}</h1>
        <div className="flex min-w-tap justify-end">{right}</div>
      </div>
    </header>
  );
}
