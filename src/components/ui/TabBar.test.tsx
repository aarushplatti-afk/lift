import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TabBar } from './TabBar';

describe('TabBar', () => {
  it('renders four tabs and tracks the active one', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <TabBar />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /Workout/ })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('link', { name: /History/ }));
    expect(screen.getByRole('link', { name: /History/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Workout/ })).not.toHaveAttribute('aria-current');
  });
});
