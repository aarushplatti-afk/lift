import { useState, type ReactNode } from 'react';
import { SignInScreen, type AuthMode } from '../routes/SignIn/SignInScreen';
import { useAuthStore } from '../store/auth';
import { useSyncStore } from '../store/sync';
import { PASSWORD_MIN_LENGTH, signIn, signUp } from '../sync/auth';
import { Button } from './ui/Button';

const DIFFERENT_ACCOUNT_WARNING =
  'This device has unsynced changes from a previous session. If you sign in with a different account, they will be discarded.';

function CenteredMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-title font-bold">{title}</h1>
      {children}
    </main>
  );
}

function SignedOut() {
  const pending = useSyncStore((s) => s.status.pendingCount);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();

  const onSubmit = async (email: string, password: string): Promise<void> => {
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    try {
      if (mode === 'signin') {
        const result = await signIn(email, password);
        if (!result.ok) setError(result.message);
        return;
      }
      const result = await signUp(email, password);
      if (!result.ok) setError(result.message);
      else if (result.needsConfirmation) {
        setMode('signin');
        setInfo(`Account created. Check ${email} for a confirmation link, then sign in here.`);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SignInScreen
      mode={mode}
      onModeChange={(next) => {
        setMode(next);
        setError(undefined);
        setInfo(undefined);
      }}
      onSubmit={onSubmit}
      busy={busy}
      error={error}
      info={info}
      passwordMinLength={PASSWORD_MIN_LENGTH}
      warning={pending > 0 ? DIFFERENT_ACCOUNT_WARNING : undefined}
    />
  );
}

function SettingUp() {
  const syncNow = useSyncStore((s) => s.syncNow);
  const state = useSyncStore((s) => s.status.state);
  const lastError = useSyncStore((s) => s.status.lastError);
  return (
    <CenteredMessage title="Setting up…">
      <p role="status" className="text-body">
        {state === 'syncing' ? 'Downloading your data.' : 'Waiting to download your data.'}
      </p>
      {state === 'offline' ? (
        <p className="text-body-sm">You are offline. Connect to the internet to finish setup.</p>
      ) : null}
      {state === 'error' ? (
        <p role="alert" className="text-body-sm text-danger">
          Error: setup couldn&apos;t finish{lastError ? ` (${lastError})` : ''}. Tap Retry.
        </p>
      ) : null}
      <Button onClick={() => void syncNow()}>Retry</Button>
    </CenteredMessage>
  );
}

export function ConfigError() {
  return (
    <CenteredMessage title="Configuration error">
      <p className="text-body">
        Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and rebuild.
      </p>
    </CenteredMessage>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const initialPullDone = useAuthStore((s) => s.initialPullDone);
  if (status === 'loading') return <CenteredMessage title="Lift" />;
  if (status === 'signedOut') return <SignedOut />;
  if (!initialPullDone) return <SettingUp />;
  return <>{children}</>;
}
