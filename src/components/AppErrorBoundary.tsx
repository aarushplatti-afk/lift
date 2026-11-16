import { Component, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useBackupExport } from '../hooks/useBackupExport';
import { Button } from './ui/Button';
import { useToastStore } from './ui/toastStore';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function details(error: Error): string {
  return `${error.message}\n${error.stack ?? ''}`.trim();
}

function ErrorFallback({ error }: { error: Error }) {
  const { exporting, exportBackup } = useBackupExport();
  const [showText, setShowText] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const text = details(error);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      useToastStore.getState().show({ message: 'Details copied' });
    } catch {
      setShowText(true);
      requestAnimationFrame(() => {
        textRef.current?.select();
      });
    }
  };

  return (
    <main
      role="alert"
      className="pt-safe pb-safe pl-safe pr-safe mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-4"
    >
      <h1 className="text-title font-bold">Something went wrong</h1>
      <p className="text-body text-secondary">
        Your data is saved on this device. Export a backup if you want a copy, then reload.
      </p>
      {showText ? (
        <textarea
          ref={textRef}
          readOnly
          aria-label="Error details"
          value={text}
          rows={6}
          className="w-full rounded-control border border-border bg-surface-2 p-2 text-[16px] text-primary"
        />
      ) : null}
      <Button
        variant="secondary"
        fullWidth
        onClick={() => {
          void copy();
        }}
      >
        Copy details
      </Button>
      <Button
        variant="secondary"
        fullWidth
        disabled={exporting}
        onClick={() => {
          void exportBackup();
        }}
      >
        Export backup
      </Button>
      <Button
        fullWidth
        onClick={() => {
          window.location.reload();
        }}
      >
        Reload
      </Button>
    </main>
  );
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) return <ErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}
