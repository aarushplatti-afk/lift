import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { Header } from '../components/ui/Header';
import { IconButton } from '../components/ui/IconButton';

export function SettingsPage() {
  const navigate = useNavigate();
  return (
    <>
      <Header
        title="Settings"
        left={
          <IconButton
            aria-label="Back"
            onClick={() => {
              navigate(-1);
            }}
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
          </IconButton>
        }
      />
      <EmptyState
        title="Settings"
        description="Units, appearance and sync options are coming soon."
      />
    </>
  );
}
