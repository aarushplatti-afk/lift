import { useState, type ReactNode } from 'react';
import { SignInScreen } from '../routes/SignIn/SignInScreen';
import { useAuthStore } from '../store/auth';
import { useSyncStore } from '../store/sync';
import { signIn } from '../sync/auth';
import { Button } from './ui/Button';

const DIFFERENT_ACCOUNT_WARNING =
  'This device has unsynced changes from a previous session. Signing in as a different account will discard them.';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const onSubmit = async (email: string, password: string): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await signIn(email, password);
    if (!result.ok) setError(result.message);
    setBusy(false);
  };

  return (
    <SignInScreen
      onSubmit={onSubmit}
      busy={busy}
      error={error}
      warning={pending > 0 ? DIFFERENT_ACCOUNT_WARNING : undefined}
    />
  );
}

function SettingUp() {
  const syncNow = useSyncStore((s) => s.syncNow);
  const state = useSyncStore((s) => s.status.state);
  return (
    <CenteredMessage title="Setting up…">
      <p role="status" className="text-body">
        Downloading your data.
      </p>
      {state === 'offline' ? (
        <p className="text-body-sm">You are offline. Connect to the internet to finish setup.</p>
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
