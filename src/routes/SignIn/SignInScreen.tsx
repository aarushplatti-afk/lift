import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { TextInput } from '../../components/ui/TextInput';

export type AuthMode = 'signin' | 'signup' | 'forgot';

interface SignInScreenProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (email: string, password: string) => Promise<void>;
  onRequestReset: (email: string) => Promise<void>;
  initialEmail?: string;
  error?: string;
  info?: string;
  busy: boolean;
  warning?: string;
  passwordMinLength: number;
}

export function SignInScreen({
  mode,
  onModeChange,
  onSubmit,
  onRequestReset,
  initialEmail = '',
  error,
  info,
  busy,
  warning,
  passwordMinLength,
}: SignInScreenProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);

  const signingUp = mode === 'signup';
  const forgot = mode === 'forgot';
  const mismatch = signingUp && confirmTouched && confirm !== password;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (forgot) {
      void onRequestReset(email.trim());
      return;
    }
    if (signingUp && confirm !== password) {
      setConfirmTouched(true);
      return;
    }
    void onSubmit(email.trim(), password);
  };

  const switchMode = (next: AuthMode) => {
    setConfirm('');
    setConfirmTouched(false);
    onModeChange(next);
  };

  const idleLabel = forgot ? 'Send reset link' : signingUp ? 'Create account' : 'Sign in';
  const busyLabel = forgot ? 'Sending...' : signingUp ? 'Creating account...' : 'Signing in...';
  const subtitle = forgot
    ? 'Reset your password'
    : signingUp
      ? 'Create your account'
      : 'Sign in to your account';

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-bold">Lift</h1>
        <p className="text-body text-secondary">{subtitle}</p>
      </div>
      {warning ? (
        <div
          role="alert"
          className="rounded-control border border-warning bg-surface p-3 text-body-sm"
        >
          <strong className="font-semibold">Warning: </strong>
          {warning}
        </div>
      ) : null}
      {info ? (
        <p
          role="status"
          className="rounded-control border border-border bg-surface p-3 text-body-sm"
        >
          {info}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        {forgot ? (
          <p className="text-body-sm text-secondary">
            Enter your email and we will send you a link to set a new password.
          </p>
        ) : (
          <TextInput
            label="Password"
            type="password"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            required
            minLength={signingUp ? passwordMinLength : undefined}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        )}
        {signingUp ? (
          <TextInput
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            error={mismatch ? 'Passwords don’t match.' : undefined}
            onChange={(e) => {
              setConfirm(e.target.value);
            }}
            onBlur={() => {
              setConfirmTouched(true);
            }}
          />
        ) : null}
        {signingUp ? (
          <p className="text-body-sm text-secondary">At least {passwordMinLength} characters.</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-body-sm font-medium text-danger">
            Error: {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" fullWidth disabled={busy} aria-busy={busy}>
          {busy ? busyLabel : idleLabel}
        </Button>
        {mode === 'signin' ? (
          <button
            type="button"
            className="min-h-tap self-center font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => {
              switchMode('forgot');
            }}
          >
            Forgot password?
          </button>
        ) : null}
      </form>
      <p className="text-center text-body-sm text-secondary">
        {forgot ? 'Remembered it?' : signingUp ? 'Already have an account?' : 'New to Lift?'}{' '}
        <button
          type="button"
          className="min-h-tap font-semibold text-accent underline-offset-4 hover:underline"
          onClick={() => {
            switchMode(signingUp || forgot ? 'signin' : 'signup');
          }}
        >
          {signingUp || forgot ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </main>
  );
}
