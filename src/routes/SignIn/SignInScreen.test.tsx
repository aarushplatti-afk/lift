import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInScreen } from './SignInScreen';

describe('SignInScreen', () => {
  it('submits entered credentials', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SignInScreen onSubmit={onSubmit} busy={false} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSubmit).toHaveBeenCalledWith('a@b.co', 'secret');
  });

  it('shows error and warning, and disables while busy', () => {
    render(<SignInScreen onSubmit={vi.fn()} busy error="Bad login" warning="Unsynced changes" />);
    expect(screen.getByText(/Bad login/)).toBeInTheDocument();
    expect(screen.getByText(/Unsynced changes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Signing in/ })).toBeDisabled();
  });
});
