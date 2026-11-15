import type { ExerciseType } from '../../types/domain';
import type { Metric } from '../../lib/calc/series';

export function metricLabel(metric: Metric, type: ExerciseType): string {
  switch (metric) {
    case 'weight':
      return type === 'weighted_bodyweight' ? 'Added weight' : 'Weight';
    case 'e1rm':
      return 'Est. 1RM';
    case 'volume':
      return type === 'bodyweight_reps' ? 'Total reps' : 'Volume';
    case 'reps':
      return 'Reps';
    case 'duration':
      return 'Longest set';
  }
}
