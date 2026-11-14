import { Link } from 'react-router-dom';

export function BackLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      aria-label="Back"
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:opacity-70"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </Link>
  );
}
