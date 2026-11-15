import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToastStore } from '../../components/ui/toastStore';
import { prepareFinish } from '../../lib/calc/finish';
import type { ExerciseTypes } from '../../lib/calc/volume';
import { useActiveWorkoutStore } from '../../store/activeWorkout';

type Stage =
  { kind: 'closed' } | { kind: 'incomplete'; count: number; onlyMark: boolean } | { kind: 'empty' };

const CLOSED: Stage = { kind: 'closed' };

interface FinishFlow {
  begin: () => void;
  finishing: boolean;
  dialogs: ReactNode;
}

export function useFinishFlow(types: ExerciseTypes): FinishFlow {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>(CLOSED);
  const [finishing, setFinishing] = useState(false);

  const run = async (markIncomplete: boolean) => {
    setStage(CLOSED);
    setFinishing(true);
    try {
      const outcome = await useActiveWorkoutStore.getState().finish({ markIncomplete });
      if (outcome.status === 'finished') {
        navigate(`/workout/summary/${outcome.workout.id}`, { replace: true });
        return;
      }
      setFinishing(false);
      setStage({ kind: 'empty' });
    } catch {
      setFinishing(false);
      useToastStore.getState().show({ message: 'Couldn’t finish the workout. Try again.' });
    }
  };

  const discard = async () => {
    setStage(CLOSED);
    setFinishing(true);
    try {
      await useActiveWorkoutStore.getState().discard();
      navigate('/', { replace: true });
    } catch {
      setFinishing(false);
      useToastStore.getState().show({ message: 'Couldn’t discard the workout. Try again.' });
    }
  };

  const begin = () => {
    const w = useActiveWorkoutStore.getState().workout;
    if (!w) return;
    const now = Date.now();
    const plan = prepareFinish(w, types, { markIncomplete: false, now });
    if (plan.incompleteCount === 0) {
      if (plan.isEmpty) setStage({ kind: 'empty' });
      else void run(false);
      return;
    }
    if (prepareFinish(w, types, { markIncomplete: true, now }).isEmpty) {
      setStage({ kind: 'empty' });
      return;
    }
    setStage({ kind: 'incomplete', count: plan.incompleteCount, onlyMark: plan.isEmpty });
  };

  const close = () => {
    setStage(CLOSED);
  };

  const dialogs = (
    <>
      <Dialog open={stage.kind === 'incomplete'} title="Finish workout?" onClose={close}>
        <p className="mb-4 text-body-sm text-secondary">
          {stage.kind === 'incomplete'
            ? `You have ${stage.count} incomplete set${stage.count === 1 ? '' : 's'}. Finish anyway?`
            : ''}
        </p>
        <div className="flex flex-col gap-2">
          <Button
            fullWidth
            onClick={() => {
              void run(true);
            }}
          >
            Mark complete &amp; finish
          </Button>
          {stage.kind === 'incomplete' && !stage.onlyMark && (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                void run(false);
              }}
            >
              Discard incomplete sets &amp; finish
            </Button>
          )}
          <Button variant="ghost" fullWidth onClick={close}>
            Cancel
          </Button>
        </div>
      </Dialog>
      <Dialog open={stage.kind === 'empty'} title="Nothing to save" onClose={close}>
        <p className="mb-4 text-body-sm text-secondary">
          This workout has no completed sets. Discard it?
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              void discard();
            }}
          >
            Discard workout
          </Button>
          <Button variant="secondary" fullWidth onClick={close}>
            Keep logging
          </Button>
        </div>
      </Dialog>
    </>
  );

  return { begin, finishing, dialogs };
}
