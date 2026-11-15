import { create } from 'zustand';
import { DEFAULT_RANGE } from '../lib/calc/range';
import type { RangeKey } from '../lib/calc/range';
import type { Metric } from '../lib/calc/series';

export type ProgressView = 'exercises' | 'bodyweight' | 'prs';

interface ProgressViewState {
  view: ProgressView;
  exerciseId?: string;
  metric?: Metric;
  range: RangeKey;
  setView(v: ProgressView): void;
  setExercise(id: string): void;
  setMetric(m: Metric): void;
  setRange(r: RangeKey): void;
}

export const useProgressViewStore = create<ProgressViewState>()((set) => ({
  view: 'exercises',
  range: DEFAULT_RANGE,
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
}));
