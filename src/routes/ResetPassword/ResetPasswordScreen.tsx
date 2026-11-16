import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { TextInput } from '../../components/ui/TextInput';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import type { RecoveryTokens } from '../../lib/authRedirect';
import {
  abandonPasswordReset,
  beginPasswordReset,
  completePasswordReset,
  PASSWORD_MIN_LENGTH,
} from '../../sync/auth';

interface ResetPasswordScreenProps {
  tokens: RecoveryTokens;
  onDone: (email: string | undefined) => void;
}

type Phase =
  | { kind: 'verifying' }
  | { kind: 'ready'; email: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'retry'; message: string }
  | { kind: 'success'; email: string };

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-title font-bold">{title}</h1>
      {children}
    </main>
  );
}

export function ResetPasswordScreen({ tokens, onDone }: ResetPasswordScreenProps) {
  const { platform } = useInstallPrompt();
  const [phase, setPhase] = useState<Phase>({ kind: 'verifying' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const started = useRef(false);

  const verify = () => {
    setPhase({ kind: 'verifying' });
    void beginPasswordReset(tokens).then((res) => {
      if (res.ok) setPhase({ kind: 'ready', email: res.email });
      else if (res.reason === 'invalid_link') setPhase({ kind: 'invalid', message: res.message });
      else setPhase({ kind: 'retry', message: res.message });
    });
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase.kind === 'verifying') {
    return (
      <Frame title="Lift">
        <p role="status" className="text-body">
          Verifying your link…
        </p>
      </Frame>
    );
  }

  if (phase.kind === 'invalid') {
    return (
      <Frame title="Link expired">
        <p role="alert" className="text-body">
          {phase.message}
        </p>
        <Button
          size="lg"
          fullWidth
          onClick={() => {
            void abandonPasswordReset();
            onDone(undefined);
          }}
        >
          Request a new link
        </Button>
      </Frame>
    );
  }

  if (phase.kind === 'retry') {
    return (
      <Frame title="Set a new password">
        <p role="alert" className="text-body text-danger">
          Error: {phase.message}
        </p>
        <Button size="lg" fullWidth onClick={verify}>
          Try again
        </Button>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            void abandonPasswordReset();
            onDone(undefined);
          }}
        >
          Back to sign in
        </Button>
      </Frame>
    );
  }

  if (phase.kind === 'success') {
    const { email } = phase;
    return (
      <Frame title="Password updated">
        <p role="status" className="text-body">
          Your password was changed. Sign in with your new password.
        </p>
        {platform === 'ios' ? (
          <p className="text-body-sm text-secondary">
            If you use Lift from your Home Screen, open it there and sign in with your new password.
          </p>
        ) : null}
        <Button
          size="lg"
          fullWidth
          onClick={() => {
            onDone(email);
          }}
        >
          Continue
        </Button>
      </Frame>
    );
  }

  const { email } = phase;
  const tooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const mismatch = touched && confirm !== password;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(undefined);
    if (password.length < PASSWORD_MIN_LENGTH || confirm !== password) return;
    setBusy(true);
    try {
      const res = await completePasswordReset(password);
      if (res.ok) setPhase({ kind: 'success', email: res.email || email });
      else if (res.reason === 'invalid_link') setPhase({ kind: 'invalid', message: res.message });
      else setError(res.message);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame title="Set a new password">
      <p className="text-body-sm text-secondary">
        Choose a new password for <span className="font-medium text-primary">{email}</span>.
      </p>
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="flex flex-col gap-4"
      >
        <TextInput
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          error={tooShort ? `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.` : undefined}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <TextInput
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          error={mismatch ? 'Passwords don’t match.' : undefined}
          onChange={(e) => {
            setConfirm(e.target.value);
          }}
          onBlur={() => {
            setTouched(true);
          }}
        />
        {error ? (
          <p role="alert" className="text-body-sm font-medium text-danger">
            Error: {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" fullWidth disabled={busy} aria-busy={busy}>
          {busy ? 'Saving...' : 'Save password'}
        </Button>
      </form>
    </Frame>
  );
}
