import { useMemo } from 'react';
import { listExercises } from '../../db/repos/exercises';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import type { ExerciseTypes } from '../../lib/calc/volume';
import type { Exercise } from '../../types/domain';

/** Null until the first query result lands, so screens can avoid flashing "Deleted exercise". */
export function useExerciseMap(): ReadonlyMap<string, Exercise> | null {
  const list = useLiveQuery<Exercise[] | null>(
    () => listExercises({ includeArchived: true }),
    [],
    null,
  );
  return useMemo(() => (list === null ? null : new Map(list.map((e) => [e.id, e]))), [list]);
}

export function toExerciseTypes(map: ReadonlyMap<string, Exercise>): ExerciseTypes {
  return new Map([...map].map(([id, e]) => [id, e.type]));
}
