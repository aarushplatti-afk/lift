import { Component } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <EmptyState
        title="Couldn’t load this screen"
        description="Reload to try again."
        action={
          <Button
            onClick={() => {
              location.reload();
            }}
          >
            Reload
          </Button>
        }
      />
    );
  }
}
