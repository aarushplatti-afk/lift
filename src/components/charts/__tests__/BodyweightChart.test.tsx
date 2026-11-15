import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { BodyweightPoint } from '../../../lib/calc/bodyweight';
import { BodyweightChart } from '../BodyweightChart';

vi.mock('../../../hooks/useElementWidth', () => ({
  useElementWidth: () => [{ current: null }, 360],
}));

const NOW = new Date(2026, 10, 14, 12).getTime();
const DAY = 86_400_000;

function makePoints(n: number): BodyweightPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const t = NOW - (n - i) * DAY;
    const value = 80 + (i % 5) * 0.4;
    return {
      t,
      value,
      trend: 80.5 + (i % 3) * 0.1,
      entry: {
        id: `b${i}`,
        date: `d${i}`,
        weightKg: value,
        createdAt: t,
        userId: 'u',
        updatedAt: t,
      },
    };
  });
}

function renderChart(points: BodyweightPoint[], goalKg?: number) {
  return render(
    <BodyweightChart points={points} goalKg={goalKg} unit="kg" now={NOW} height={240} />,
  );
}

describe('BodyweightChart', () => {
  it('renders no dots and no trend for 0 points', () => {
    const { container } = renderChart([]);
    expect(container.querySelectorAll('.lift-bw-raw-dot')).toHaveLength(0);
    expect(container.querySelector('.lift-bw-trend .recharts-line-curve')).toBeNull();
    expect(screen.getByText('Bodyweight chart, no weigh-ins')).toBeInTheDocument();
  });

  it('renders one dot, no trend and the note for 1 point', () => {
    const { container } = renderChart(makePoints(1));
    expect(container.querySelectorAll('.lift-bw-raw-dot')).toHaveLength(1);
    expect(container.querySelector('.lift-bw-trend')).toBeNull();
    expect(
      screen.getByText('One weigh-in so far. Log another to see a trend.'),
    ).toBeInTheDocument();
  });

  it('renders the trend path and a dot per point for many points', () => {
    const { container } = renderChart(makePoints(5));
    expect(container.querySelector('.lift-bw-trend .recharts-line-curve')).not.toBeNull();
    expect(container.querySelectorAll('.lift-bw-raw-dot')).toHaveLength(5);
    expect(screen.queryByText(/One weigh-in so far/)).toBeNull();
  });

  it('renders the goal line and label only when a goal is given', () => {
    const { container, rerender } = renderChart(makePoints(5), 75);
    expect(container.querySelector('.lift-bw-goal')).not.toBeNull();
    expect(screen.getByText('Goal 75 kg')).toBeInTheDocument();
    rerender(<BodyweightChart points={makePoints(5)} unit="kg" now={NOW} height={240} />);
    expect(container.querySelector('.lift-bw-goal')).toBeNull();
    expect(screen.queryByText(/^Goal /)).toBeNull();
  });

  it('includes a far goal in the y domain', () => {
    const { container } = renderChart(makePoints(5), 150);
    const ticks = Array.from(
      container.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value'),
    ).map((el) => Number((el.textContent ?? '').replace(/,/g, '')));
    expect(ticks.length).toBeGreaterThan(0);
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(150);
  });

  it('provides a screen reader summary', () => {
    renderChart(makePoints(3));
    expect(screen.getByText(/^Bodyweight chart, 3 weigh-ins, from .* to .*$/)).toBeInTheDocument();
  });

  it('downsamples above 500 points', () => {
    const { container } = renderChart(makePoints(1200));
    const dots = container.querySelectorAll('.lift-bw-raw-dot').length;
    expect(dots).toBeGreaterThan(0);
    expect(dots).toBeLessThanOrEqual(500);
  });
});
