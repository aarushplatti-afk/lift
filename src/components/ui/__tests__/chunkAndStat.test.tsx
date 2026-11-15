import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ChunkErrorBoundary } from '../ChunkErrorBoundary';
import { StatTile } from '../StatTile';

function Boom(): never {
  throw new Error('chunk failed');
}

describe('ChunkErrorBoundary', () => {
  it('renders children when nothing fails', () => {
    render(
      <ChunkErrorBoundary>
        <p>ok</p>
      </ChunkErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('shows the fallback and reloads only on user action', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(
      <ChunkErrorBoundary>
        <Boom />
      </ChunkErrorBoundary>,
    );
    expect(screen.getByText('Couldn’t load this screen')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    spy.mockRestore();
  });
});

describe('StatTile', () => {
  it('renders label and value without detail', () => {
    render(<StatTile label="Workouts" value="4" />);
    expect(screen.getByText('Workouts')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders the optional detail line', () => {
    render(<StatTile label="Change · 3M" value="+20 lb" detail="+10%" />);
    expect(screen.getByText('+10%')).toBeInTheDocument();
  });
});
