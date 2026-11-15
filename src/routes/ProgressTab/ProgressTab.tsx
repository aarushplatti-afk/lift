import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '../../components/ui/Header';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useProgressViewStore } from '../../store/progressView';
import type { ProgressView } from '../../store/progressView';
import { BodyweightView } from './Bodyweight/BodyweightView';
import { ExercisesView } from './ExercisesView';
import { PRsView } from './PRs/PRsView';

const VIEWS: readonly { value: ProgressView; label: string }[] = [
  { value: 'exercises', label: 'Exercises' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'prs', label: 'PRs' },
];

export function ProgressTab() {
  const view = useProgressViewStore((s) => s.view);
  const setView = useProgressViewStore((s) => s.setView);
  const [params, setSearchParams] = useSearchParams();
  const deepLink = params.get('exercise');

  useEffect(() => {
    if (deepLink) {
      const store = useProgressViewStore.getState();
      store.setExercise(deepLink);
      store.setView('exercises');
      setSearchParams({}, { replace: true });
    }
  }, [deepLink, setSearchParams]);

  return (
    <>
      <Header title="Progress" />
      <main className="flex flex-col gap-4 px-4 py-4">
        <SegmentedControl<ProgressView>
          label="Progress views"
          options={VIEWS}
          value={view}
          onChange={setView}
        />
        {view === 'exercises' ? <ExercisesView /> : null}
        {view === 'bodyweight' ? <BodyweightView /> : null}
        {view === 'prs' ? <PRsView /> : null}
      </main>
    </>
  );
}
