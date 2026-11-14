import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { Header } from '../components/ui/Header';
import { IconButton } from '../components/ui/IconButton';

export function WorkoutTab() {
  const navigate = useNavigate();
  return (
    <>
      <Header
        title="Workout"
        right={
          <IconButton
            aria-label="Settings"
            onClick={() => {
              navigate('/settings');
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
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
            </svg>
          </IconButton>
        }
      />
      <EmptyState title="No workout in progress" description="Start a workout to log your sets." />
    </>
  );
}
