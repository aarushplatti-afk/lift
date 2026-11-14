import type { ReactNode } from 'react';
import type { ExerciseType, Unit } from '../../types/domain';
import { SET_COL, SET_ROW_LAYOUT } from './setColumns';

interface WorkoutSetTableProps {
  type: ExerciseType;
  unit: Unit;
  children: ReactNode;
}

const HEAD = 'text-center text-caption font-medium uppercase tracking-wide text-secondary';

export function WorkoutSetTable({ type, unit, children }: WorkoutSetTableProps) {
  const unitLabel = unit.toUpperCase();
  const weightLabel = type === 'weighted_bodyweight' ? `+${unitLabel}` : unitLabel;
  return (
    <div role="group" aria-label="Sets">
      <div className={`${SET_ROW_LAYOUT} px-1 pb-1`} aria-hidden="true">
        <span className={`${SET_COL.badge} ${HEAD}`}>Set</span>
        <span className={`${SET_COL.previous} ${HEAD}`}>Previous</span>
        {(type === 'weight_reps' || type === 'weighted_bodyweight') && (
          <span className={`${SET_COL.weight} ${HEAD}`}>{weightLabel}</span>
        )}
        {type !== 'duration' && <span className={`${SET_COL.reps} ${HEAD}`}>Reps</span>}
        {type === 'duration' && <span className={`${SET_COL.time} ${HEAD}`}>Time</span>}
        <span className={`${SET_COL.check} ${HEAD}`}>✓</span>
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
