import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastHost } from './Toast';
import { useToastStore } from './toastStore';

describe('Toast', () => {
  it('runs the action and dismisses', async () => {
    const onAction = vi.fn();
    render(<ToastHost />);
    act(() => {
      useToastStore.getState().show({ message: 'Deleted', actionLabel: 'Undo', onAction });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Deleted');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
