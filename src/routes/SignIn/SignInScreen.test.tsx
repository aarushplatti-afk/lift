import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInScreen } from './SignInScreen';

const base = { onModeChange: vi.fn(), passwordMinLength: 8, busy: false } as const;

describe('SignInScreen', () => {
  it('submits entered credentials', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SignInScreen {...base} mode="signin" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSubmit).toHaveBeenCalledWith('a@b.co', 'secret');
  });

  it('shows error and warning, and disables while busy', () => {
    render(
      <SignInScreen
        {...base}
        mode="signin"
        onSubmit={vi.fn()}
        busy
        error="Bad login"
        warning="Unsynced changes"
      />,
    );
    expect(screen.getByText(/Bad login/)).toBeInTheDocument();
    expect(screen.getByText(/Unsynced changes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Signing in/ })).toBeDisabled();
  });

  it('switches to sign-up mode from the link', async () => {
    const onModeChange = vi.fn();
    render(<SignInScreen {...base} mode="signin" onModeChange={onModeChange} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(onModeChange).toHaveBeenCalledWith('signup');
  });

  it('requires matching passwords before creating an account', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SignInScreen {...base} mode="signup" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'longenough');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Passwords don’t match.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Confirm password'));
    await userEvent.type(screen.getByLabelText('Confirm password'), 'longenough');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(onSubmit).toHaveBeenCalledWith('a@b.co', 'longenough');
  });

  it('shows an info message', () => {
    render(<SignInScreen {...base} mode="signin" onSubmit={vi.fn()} info="Check your email" />);
    expect(screen.getByRole('status')).toHaveTextContent('Check your email');
  });
});
