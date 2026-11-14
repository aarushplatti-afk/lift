import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ExerciseForm } from '../../components/exercises/ExerciseForm';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Header } from '../../components/ui/Header';
import { useToastStore } from '../../components/ui/toastStore';
import {
  createExercise,
  getExercise,
  isExerciseUsed,
  updateExercise,
} from '../../db/repos/exercises';
import type { ExerciseInput, ExerciseWriteResult } from '../../db/repos/exercises';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { MUSCLE_GROUPS } from '../../lib/exercises';
import type { Exercise } from '../../types/domain';

const FORM_ID = 'exercise-form';
const LOCK_SEEDED = 'Built-in exercises can’t be renamed or change type.';
const LOCK_USED = 'Type can’t change after the exercise has been logged.';

export function ExerciseFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const editing = id !== undefined;

  const exercise = useLiveQuery<Exercise | null | undefined>(
    async () => (id === undefined ? null : ((await getExercise(id)) ?? null)),
    [id],
    undefined,
  );
  const used = useLiveQuery<boolean | undefined>(
    () => (id === undefined ? Promise.resolve(false) : isExerciseUsed(id)),
    [id],
    undefined,
  );

  const cancel = () => {
    if (location.key === 'default')
      navigate(id === undefined ? '/exercises' : `/exercises/${id}`, { replace: true });
    else navigate(-1);
  };

  const header = (save: boolean) => (
    <Header
      title={editing ? 'Edit exercise' : 'New exercise'}
      left={
        <Button variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      }
      right={
        save ? (
          <Button variant="ghost" type="submit" form={FORM_ID}>
            Save
          </Button>
        ) : undefined
      }
    />
  );

  if (exercise === undefined || used === undefined) return header(false);
  if (editing && exercise === null) {
    return (
      <>
        {header(false)}
        <EmptyState
          title="Exercise not found"
          description="It may have been deleted on another device."
          action={
            <Link
              to="/exercises"
              className="inline-flex min-h-tap items-center px-4 text-body font-semibold text-accent"
            >
              Back to exercises
            </Link>
          }
        />
      </>
    );
  }

  const muscleParam = params.get('muscle');
  const prefillMuscle = MUSCLE_GROUPS.find((m) => m.value === muscleParam)?.value;
  const initial: Partial<ExerciseInput> = exercise
    ? {
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        type: exercise.type,
        ...(exercise.notes === undefined ? {} : { notes: exercise.notes }),
      }
    : {
        name: params.get('name') ?? '',
        ...(prefillMuscle === undefined ? {} : { muscleGroup: prefillMuscle }),
      };

  const seeded = exercise !== null && !exercise.isCustom;
  const typeLocked = exercise !== null && exercise.isCustom && used;

  const onSubmit = async (input: ExerciseInput): Promise<ExerciseWriteResult | undefined> => {
    try {
      const result =
        exercise === null ? await createExercise(input) : await updateExercise(exercise.id, input);
      if (result.ok) {
        if (exercise === null) navigate(`/exercises/${result.exercise.id}`, { replace: true });
        else cancel();
      }
      return result;
    } catch {
      useToastStore.getState().show({ message: 'Couldn’t save. Storage may be full.' });
      return undefined;
    }
  };

  return (
    <>
      {header(true)}
      <div className="p-4">
        <ExerciseForm
          key={exercise?.id ?? 'new'}
          formId={FORM_ID}
          showSubmit={false}
          initial={initial}
          locked={{ name: seeded, type: seeded || typeLocked }}
          lockReason={seeded ? LOCK_SEEDED : LOCK_USED}
          submitLabel="Save"
          excludeId={exercise?.id}
          archived={exercise?.archived === true}
          onSubmit={onSubmit}
          onCancel={cancel}
        />
      </div>
    </>
  );
}
