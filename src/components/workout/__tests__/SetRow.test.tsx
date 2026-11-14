import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { NumberInput } from '../../ui/NumberInput';
import { SetRow } from '../SetRow';
import { WorkoutSetTable } from '../WorkoutSetTable';
import type { CompleteResult } from '../../../lib/calc/validation';
import type { SetPatch } from '../../../lib/workoutOps';
import type { ExerciseType, Unit, WorkoutSet } from '../../../types/domain';

const baseSet: WorkoutSet = { id: 's1', order: 0, type: 'normal', completed: false };

function renderRow(
  type: ExerciseType,
  opts: {
    set?: Partial<WorkoutSet>;
    unit?: Unit;
    onChange?: (p: SetPatch) => void;
    onToggle?: () => CompleteResult;
    onBadge?: () => void;
  } = {},
) {
  const ui = (unit: Unit) => (
    <WorkoutSetTable type={type} unit={unit}>
      <SetRow
        set={{ ...baseSet, ...opts.set }}
        index={0}
        type={type}
        unit={unit}
        onChange={opts.onChange ?? (() => undefined)}
        onToggle={opts.onToggle ?? (() => ({ ok: true, completed: true }))}
        onBadge={opts.onBadge ?? (() => undefined)}
      />
    </WorkoutSetTable>
  );
  const utils = render(ui(opts.unit ?? 'lb'));
  return { ...utils, rerenderUnit: (u: Unit) => utils.rerender(ui(u)) };
}

describe('SetRow columns', () => {
  it('weight_reps shows weight and reps', () => {
    renderRow('weight_reps');
    expect(screen.getByText('LB')).toBeInTheDocument();
    expect(screen.getByText('Reps')).toBeInTheDocument();
    expect(screen.getByLabelText('Weight (lb) set 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Reps set 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Time set 1')).toBeNull();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('bodyweight_reps shows reps only', () => {
    renderRow('bodyweight_reps');
    expect(screen.queryByLabelText('Weight (lb) set 1')).toBeNull();
    expect(screen.getByLabelText('Reps set 1')).toBeInTheDocument();
    expect(screen.queryByText('LB')).toBeNull();
  });

  it('weighted_bodyweight shows +LB header and added weight', () => {
    renderRow('weighted_bodyweight');
    expect(screen.getByText('+LB')).toBeInTheDocument();
    expect(screen.getByLabelText('Added weight (lb) set 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Reps set 1')).toBeInTheDocument();
  });

  it('duration shows time only', () => {
    renderRow('duration', { set: { durationSec: 90 } });
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByLabelText('Time set 1')).toHaveValue('1:30');
    expect(screen.queryByLabelText('Reps set 1')).toBeNull();
    expect(screen.queryByLabelText('Weight (lb) set 1')).toBeNull();
  });
});

describe('SetRow weight units', () => {
  it('re-renders the same kg value in lb and kg', () => {
    const { rerenderUnit } = renderRow('weight_reps', { set: { weightKg: 100 } });
    expect(screen.getByLabelText('Weight (lb) set 1')).toHaveValue('220.5');
    rerenderUnit('kg');
    expect(screen.getByText('KG')).toBeInTheDocument();
    expect(screen.getByLabelText('Weight (kg) set 1')).toHaveValue('100');
  });

  it('commits kg for "137,5" lb', async () => {
    const onChange = vi.fn<(p: SetPatch) => void>();
    renderRow('weight_reps', { onChange });
    const input = screen.getByLabelText('Weight (lb) set 1');
    await userEvent.type(input, '137,5');
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last?.weightKg).toBeCloseTo(137.5 * 0.45359237, 3);
  });

  it('shows a soft warning caption without blocking', () => {
    renderRow('weight_reps', { set: { weightKg: 1000, reps: 1000 } });
    expect(screen.getByText('Over 2000 lb. Check for a typo.')).toBeInTheDocument();
    expect(screen.getByText('Over 999 reps. Check for a typo.')).toBeInTheDocument();
  });
});

describe('SetRow completion', () => {
  it('blank weight toggle shakes, focuses weight, and announces', async () => {
    const onToggle = vi.fn<() => CompleteResult>(() => ({ ok: false, field: 'weight' }));
    renderRow('weight_reps', { onToggle });
    await userEvent.click(screen.getByRole('button', { name: 'Complete set 1' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Weight (lb) set 1')).toHaveFocus();
    expect(screen.getByLabelText('Weight (lb) set 1')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Enter a weight');
    expect(screen.getByRole('group', { name: 'Set 1' }).className).toContain('animate-shake');
  });

  it('announces reps and time messages', async () => {
    const onToggle = vi.fn<() => CompleteResult>(() => ({ ok: false, field: 'duration' }));
    renderRow('duration', { onToggle });
    await userEvent.click(screen.getByRole('button', { name: 'Complete set 1' }));
    expect(screen.getByLabelText('Time set 1')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Enter a time');
  });

  it('bodyweight set completes without weight', async () => {
    const onToggle = vi.fn<() => CompleteResult>(() => ({ ok: true, completed: true }));
    renderRow('bodyweight_reps', { set: { reps: 10 }, onToggle });
    await userEvent.click(screen.getByRole('button', { name: 'Complete set 1' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('completed set exposes pressed state and incomplete label', () => {
    renderRow('weight_reps', { set: { weightKg: 50, reps: 5, completed: true } });
    const btn = screen.getByRole('button', { name: 'Mark set 1 incomplete' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('badge tap calls onBadge', async () => {
    const onBadge = vi.fn();
    renderRow('weight_reps', { onBadge });
    await userEvent.click(screen.getByRole('button', { name: 'Set 1 options' }));
    expect(onBadge).toHaveBeenCalledTimes(1);
  });
});

describe('NumberInput', () => {
  function Harness({ onCommit }: { onCommit: (v: number | undefined) => void }) {
    const [value, setValue] = useState<number | undefined>(5);
    return (
      <NumberInput
        aria-label="num"
        mode="decimal"
        value={value}
        format={(v) => String(v)}
        parse={(r) => (/^\d+(\.\d+)?$/.test(r) ? Number(r) : undefined)}
        onCommit={(v) => {
          setValue(v);
          onCommit(v);
        }}
      />
    );
  }

  it('selects text on focus', async () => {
    render(<Harness onCommit={() => undefined} />);
    const input = screen.getByLabelText<HTMLInputElement>('num');
    await userEvent.click(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(1);
  });

  it('does not commit an invalid draft but keeps it displayed', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText('num');
    await userEvent.clear(input);
    onCommit.mockClear();
    await userEvent.type(input, 'abc');
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue('abc');
    await userEvent.tab();
    expect(input).toHaveValue('');
  });

  it('commits undefined when emptied', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    await userEvent.clear(screen.getByLabelText('num'));
    expect(onCommit).toHaveBeenLastCalledWith(undefined);
  });

  it('integer mode strips non-digits', async () => {
    const onCommit = vi.fn();
    render(
      <NumberInput
        aria-label="int"
        mode="integer"
        value={undefined}
        format={String}
        parse={(r) => Number(r)}
        onCommit={onCommit}
      />,
    );
    await userEvent.type(screen.getByLabelText('int'), '1a2');
    expect(onCommit).toHaveBeenLastCalledWith(12);
  });
});
