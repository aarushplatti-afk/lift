import { ChipGroup } from '../ui/Chip';
import { SearchInput } from '../ui/SearchInput';
import { MUSCLE_GROUPS } from '../../lib/exercises';
import type { MuscleGroup } from '../../types/domain';

interface ExerciseFilterBarProps {
  query: string;
  onQuery: (query: string) => void;
  muscle: MuscleGroup | 'all';
  onMuscle: (muscle: MuscleGroup | 'all') => void;
}

const MUSCLE_OPTIONS = [{ value: 'all' as const, label: 'All' }, ...MUSCLE_GROUPS];

export function ExerciseFilterBar({ query, onQuery, muscle, onMuscle }: ExerciseFilterBarProps) {
  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        label="Search exercises"
        placeholder="Search exercises"
        value={query}
        onChange={onQuery}
      />
      <ChipGroup
        label="Filter by muscle group"
        options={MUSCLE_OPTIONS}
        value={muscle}
        onChange={onMuscle}
      />
    </div>
  );
}
