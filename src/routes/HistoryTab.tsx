import { EmptyState } from '../components/ui/EmptyState';
import { Header } from '../components/ui/Header';

export function HistoryTab() {
  return (
    <>
      <Header title="History" />
      <EmptyState title="No workouts yet" description="Completed workouts will show up here." />
    </>
  );
}
