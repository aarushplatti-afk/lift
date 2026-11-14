import { EmptyState } from '../components/ui/EmptyState';
import { Header } from '../components/ui/Header';

export function ExercisesTab() {
  return (
    <>
      <Header title="Exercises" />
      <EmptyState title="No exercises yet" description="Your exercise library will appear here." />
    </>
  );
}
