import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GoalWeightField } from '../GoalWeightField';

describe('GoalWeightField', () => {
  it('saves on blur in kg, rounded to 3 dp', async () => {
    const onSave = vi.fn();
    render(<GoalWeightField unit="lb" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Goal weight in lb' });
    await userEvent.type(input, '170');
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toBeCloseTo(77.111, 3);
  });

  it('saves on Enter once', async () => {
    const onSave = vi.fn();
    render(<GoalWeightField unit="kg" onSave={onSave} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Goal weight in kg' }), '80{Enter}');
    await userEvent.tab();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(80);
  });

  it('shows an error and does not save above the maximum', async () => {
    const onSave = vi.fn();
    render(<GoalWeightField unit="lb" onSave={onSave} />);
    await userEvent.type(screen.getByRole('textbox'), '1543.3{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Weight must be under 1543.2 lb');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the low error for zero', async () => {
    const onSave = vi.fn();
    render(<GoalWeightField unit="kg" onSave={onSave} />);
    await userEvent.type(screen.getByRole('textbox'), '0{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight above 0');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears the goal', async () => {
    const onSave = vi.fn();
    render(<GoalWeightField goalKg={80} unit="kg" onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear goal' }));
    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  it('Enter on Clear goal still activates it', async () => {
    const onSave = vi.fn();
    render(<GoalWeightField goalKg={80} unit="kg" onSave={onSave} />);
    screen.getByRole('button', { name: 'Clear goal' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  it('shows a goal pulled from another device after a local save', async () => {
    const onSave = vi.fn();
    const { rerender } = render(<GoalWeightField unit="kg" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Goal weight in kg' });
    await userEvent.type(input, '80{Enter}');
    await userEvent.tab();
    rerender(<GoalWeightField goalKg={80} unit="kg" onSave={onSave} />);
    expect(input).toHaveValue('80');
    rerender(<GoalWeightField goalKg={75} unit="kg" onSave={onSave} />);
    expect(screen.getByRole('textbox', { name: 'Goal weight in kg' })).toHaveValue('75');
  });

  it('reverts a blank draft on blur without saving', async () => {
    const onSave = vi.fn();
    render(<GoalWeightField goalKg={80} unit="kg" onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Goal weight in kg' });
    await userEvent.clear(input);
    await userEvent.tab();
    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveValue('80');
  });

  it('hides Clear goal when no goal is set', () => {
    render(<GoalWeightField unit="kg" onSave={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Clear goal' })).toBeNull();
  });

  it('re-renders the shown value when the unit changes', () => {
    const { rerender } = render(<GoalWeightField goalKg={80} unit="kg" onSave={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Goal weight in kg' })).toHaveValue('80');
    rerender(<GoalWeightField goalKg={80} unit="lb" onSave={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Goal weight in lb' })).toHaveValue('176.4');
  });
});
