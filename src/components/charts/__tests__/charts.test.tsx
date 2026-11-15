import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { Point } from '../../../lib/calc/series';
import { ExerciseChart } from '../ExerciseChart';
import { metricLabel } from '../metricLabels';
import type { ExerciseType } from '../../../types/domain';
import type { Metric } from '../../../lib/calc/series';

vi.mock('../../../hooks/useElementWidth', () => ({
  useElementWidth: () => [{ current: null }, 360],
}));

const NOW = new Date(2026, 10, 14, 12).getTime();
const DAY = 86_400_000;

function makePoints(n: number): Point[] {
  return Array.from({ length: n }, (_, i) => ({
    t: NOW - (n - i) * DAY,
    value: 100 + (i % 7) * 2.5,
    workoutId: `w${i}`,
    setCount: 3,
    set: { id: `s${i}`, order: 0, type: 'normal', weightKg: 100, reps: 5, completed: true },
  }));
}

function renderChart(points: Point[], metric: Metric = 'weight') {
  return render(
    <ExerciseChart points={points} metric={metric} type="weight_reps" unit="lb" now={NOW} height={240} />,
  );
}

describe('ExerciseChart', () => {
  it('renders no line and no dots for 0 points', () => {
    const { container } = renderChart([]);
    expect(container.querySelector('.recharts-line-curve')).toBeNull();
    expect(container.querySelectorAll('.recharts-line-dot')).toHaveLength(0);
    expect(screen.getByText('Weight chart, no workouts')).toBeInTheDocument();
  });

  it('renders one dot, no line and the note for 1 point', () => {
    const { container } = renderChart(makePoints(1));
    expect(container.querySelector('.recharts-line-curve')).toBeNull();
    expect(container.querySelectorAll('.recharts-line-dot')).toHaveLength(1);
    expect(screen.getByText('One workout so far. Log another to see a trend.')).toBeInTheDocument();
  });

  it('renders the line and a dot per point for many points', () => {
    const { container } = renderChart(makePoints(5));
    expect(container.querySelector('.recharts-line-curve')).not.toBeNull();
    expect(container.querySelectorAll('.recharts-line-dot')).toHaveLength(5);
    expect(screen.queryByText(/One workout so far/)).toBeNull();
  });

  it('downsamples above 500 points', () => {
    const { container } = renderChart(makePoints(1200));
    expect(container.querySelectorAll('.recharts-line-dot').length).toBeLessThanOrEqual(500);
  });

  it('provides a screen reader summary', () => {
    renderChart(makePoints(3), 'e1rm');
    expect(screen.getByText(/^Est\. 1RM chart, 3 workouts, from .* to .*$/)).toBeInTheDocument();
  });
});

describe('metricLabel', () => {
  const cases: [Metric, ExerciseType, string][] = [
    ['weight', 'weight_reps', 'Weight'],
    ['weight', 'weighted_bodyweight', 'Added weight'],
    ['e1rm', 'weight_reps', 'Est. 1RM'],
    ['volume', 'weight_reps', 'Volume'],
    ['volume', 'bodyweight_reps', 'Total reps'],
    ['reps', 'bodyweight_reps', 'Reps'],
    ['duration', 'duration', 'Longest set'],
  ];
  it.each(cases)('%s / %s -> %s', (metric, type, label) => {
    expect(metricLabel(metric, type)).toBe(label);
  });
});
