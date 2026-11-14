import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  'aria-label': string;
  children: ReactNode;
}

export function IconButton({
  className = '',
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-primary transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:opacity-70 disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
