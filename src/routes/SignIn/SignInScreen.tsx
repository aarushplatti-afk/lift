import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { TextInput } from '../../components/ui/TextInput';

export type AuthMode = 'signin' | 'signup';

interface SignInScreenProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (email: string, password: string) => Promise<void>;
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
  error,
  info,
  busy,
  warning,
  passwordMinLength,
}: SignInScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);

  const signingUp = mode === 'signup';
  const mismatch = signingUp && confirmTouched && confirm !== password;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (signingUp && confirm !== password) {
      setConfirmTouched(true);
      return;
    }
    void onSubmit(email.trim(), password);
  };

  const switchMode = () => {
    setConfirm('');
    setConfirmTouched(false);
    onModeChange(signingUp ? 'signin' : 'signup');
  };

  const idleLabel = signingUp ? 'Create account' : 'Sign in';
  const busyLabel = signingUp ? 'Creating account...' : 'Signing in...';

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-bold">Lift</h1>
        <p className="text-body text-secondary">
          {signingUp ? 'Create your account' : 'Sign in to your account'}
        </p>
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
      </form>
      <p className="text-center text-body-sm text-secondary">
        {signingUp ? 'Already have an account?' : 'New to Lift?'}{' '}
        <button
          type="button"
          className="min-h-tap font-semibold text-accent underline-offset-4 hover:underline"
          onClick={switchMode}
        >
          {signingUp ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </main>
  );
}
