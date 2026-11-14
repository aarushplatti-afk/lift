import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { TextInput } from '../../components/ui/TextInput';

interface SignInScreenProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  error?: string;
  busy: boolean;
  warning?: string;
}

export function SignInScreen({ onSubmit, error, busy, warning }: SignInScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void onSubmit(email, password);
  };

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-title font-bold">Lift</h1>
      {warning ? (
        <div
          role="alert"
          className="rounded-control border border-warning bg-surface p-3 text-body-sm"
        >
          <strong className="font-semibold">Warning: </strong>
          {warning}
        </div>
      ) : null}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <TextInput
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        {error ? (
          <p role="alert" className="text-body-sm font-medium text-danger">
            Error: {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" fullWidth disabled={busy} aria-busy={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
