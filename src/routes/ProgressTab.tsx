import { EmptyState } from '../components/ui/EmptyState';
import { Header } from '../components/ui/Header';

export function ProgressTab() {
  return (
    <>
      <Header title="Progress" />
      <EmptyState
        title="No data yet"
        description="Log a few workouts to see your progress charts."
      />
    </>
  );
}
