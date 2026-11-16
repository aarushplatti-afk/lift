import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { abandonPasswordReset } from '../../sync/auth';
import { ResetPasswordScreen } from './ResetPasswordScreen';

const begin = vi.hoisted(() => vi.fn());
const complete = vi.hoisted(() => vi.fn());
vi.mock('../../sync/auth', () => ({
  PASSWORD_MIN_LENGTH: 8,
  abandonPasswordReset: vi.fn(() => Promise.resolve()),
  beginPasswordReset: begin,
  completePasswordReset: complete,
}));

const tokens = { accessToken: 'a', refreshToken: 'r' };

beforeEach(() => {
  begin.mockReset();
  complete.mockReset();
  vi.mocked(abandonPasswordReset).mockClear();
});

describe('ResetPasswordScreen', () => {
  it('verifies, validates, saves and continues with the email', async () => {
    begin.mockResolvedValue({ ok: true, email: 'me@x.co' });
    complete.mockResolvedValue({ ok: true, email: 'me@x.co' });
    const onDone = vi.fn();
    render(<ResetPasswordScreen tokens={tokens} onDone={onDone} />);
    expect(screen.getByRole('status')).toHaveTextContent('Verifying');
    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
    expect(screen.getByText('me@x.co')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('New password'), 'short');
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('New password'));
    await userEvent.type(screen.getByLabelText('New password'), 'longenough');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different1');
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect(screen.getByText('Passwords don’t match.')).toBeInTheDocument();
    expect(complete).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Confirm new password'));
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'longenough');
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect(complete).toHaveBeenCalledWith('longenough');
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onDone).toHaveBeenCalledWith('me@x.co');
  });

  it('shows an invalid link with a request-new-link action', async () => {
    begin.mockResolvedValue({ ok: false, reason: 'invalid_link', message: 'Link bad.' });
    const onDone = vi.fn();
    render(<ResetPasswordScreen tokens={tokens} onDone={onDone} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Link bad.');
    await userEvent.click(screen.getByRole('button', { name: 'Request a new link' }));
    expect(onDone).toHaveBeenCalledWith(undefined);
    expect(abandonPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('Back to sign in abandons the recovery session', async () => {
    begin.mockResolvedValue({ ok: false, reason: 'error', message: 'Try later.' });
    const onDone = vi.fn();
    render(<ResetPasswordScreen tokens={tokens} onDone={onDone} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Back to sign in' }));
    expect(abandonPasswordReset).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(undefined);
  });

  it('shows server errors from saving', async () => {
    begin.mockResolvedValue({ ok: true, email: 'me@x.co' });
    complete.mockResolvedValue({
      ok: false,
      reason: 'same_password',
      message: 'Choose different.',
    });
    render(<ResetPasswordScreen tokens={tokens} onDone={vi.fn()} />);
    await screen.findByLabelText('New password');
    await userEvent.type(screen.getByLabelText('New password'), 'longenough');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'longenough');
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose different.');
  });
});
