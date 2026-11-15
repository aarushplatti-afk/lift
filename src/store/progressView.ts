import { create } from 'zustand';
import { DEFAULT_RANGE } from '../lib/calc/range';
import type { RangeKey } from '../lib/calc/range';
import type { Metric } from '../lib/calc/series';
import type { MuscleGroup } from '../types/domain';

export type ProgressView = 'exercises' | 'bodyweight' | 'prs';

interface ProgressViewState {
  view: ProgressView;
  exerciseId?: string;
  metric?: Metric;
  range: RangeKey;
  bodyweightRange: RangeKey;
  prsQuery: string;
  prsMuscle: MuscleGroup | 'all';
  setView(v: ProgressView): void;
  setExercise(id: string): void;
  setMetric(m: Metric): void;
  setRange(r: RangeKey): void;
  setBodyweightRange(r: RangeKey): void;
  setPrsQuery(q: string): void;
  setPrsMuscle(m: MuscleGroup | 'all'): void;
}

export const useProgressViewStore = create<ProgressViewState>()((set) => ({
  view: 'exercises',
  range: DEFAULT_RANGE,
  bodyweightRange: DEFAULT_RANGE,
  prsQuery: '',
  prsMuscle: 'all',
  setView: (view) => {
    set({ view });
  },
  setExercise: (exerciseId) => {
    set({ exerciseId });
  },
  setMetric: (metric) => {
    set({ metric });
  },
  setRange: (range) => {
    set({ range });
  },
  setBodyweightRange: (bodyweightRange) => {
    set({ bodyweightRange });
  },
  setPrsQuery: (prsQuery) => {
    set({ prsQuery });
  },
  setPrsMuscle: (prsMuscle) => {
    set({ prsMuscle });
  },
}));
