import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastHost } from '../../../components/ui/Toast';
import { useToastStore } from '../../../components/ui/toastStore';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { todayLocal } from '../../../lib/dates';
import { bodyweightId } from '../../../lib/ids';
import { fromDisplay } from '../../../lib/units';
import { useProgressViewStore } from '../../../store/progressView';
import { useSettingsStore } from '../../../store/settings';
import type { BodyweightEntry, Unit } from '../../../types/domain';
import { BodyweightView } from '../Bodyweight/BodyweightView';

vi.mock('../../../hooks/useElementWidth', () => ({
  useElementWidth: () => [{ current: null }, 360],
}));

const OWNER = 'u1';

function dateAgo(days: number): string {
  const d = new Date();
  return todayLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() - days, 12).getTime());
}

function entry(daysAgo: number, lb: number, note?: string): BodyweightEntry {
  const date = dateAgo(daysAgo);
  return {
    id: bodyweightId(OWNER, date),
    userId: OWNER,
    date,
    weightKg: fromDisplay(lb, 'lb'),
    ...(note === undefined ? {} : { note }),
    createdAt: 1,
    updatedAt: 1,
  };
}

async function seed(...entries: BodyweightEntry[]) {
  await db.bodyweight.bulkPut(entries);
}

function setSettings(unit: Unit, goalKg?: number) {
  useSettingsStore.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      unit,
      ...(goalKg === undefined ? {} : { bodyweightGoalKg: goalKg }),
    },
    hydrated: true,
  });
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={['/progress']}>
      <ToastHost />
      <Routes>
        <Route path="/progress" element={<BodyweightView />} />
        <Route path="/settings" element={<div>Settings page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function weightInput(unit: Unit = 'lb'): HTMLInputElement {
  return screen.getByRole('textbox', { name: `Weight in ${unit}` });
}

function dateInput(): HTMLInputElement {
  return screen.getByLabelText('Date');
}

function tile(label: string): HTMLElement {
  const el = screen.getByText(label).parentElement;
  if (!el) throw new Error('tile not found');
  return el;
}

function rows(): HTMLElement[] {
  return screen.getAllByRole('button', { name: /^Edit weigh-in/ });
}

async function typeWeight(text: string, unit: Unit = 'lb') {
  const input = weightInput(unit);
  await userEvent.clear(input);
  await userEvent.type(input, text);
}

beforeEach(async () => {
  cleanup();
  useToastStore.getState().dismiss();
  await wipeLocalData();
  await setOwner(OWNER, 'a@b.c');
  setSettings('lb');
  useProgressViewStore.setState({ bodyweightRange: '3M' });
});

describe('empty state and log card', () => {
  it('shows the empty state and focuses the weight input from the CTA', async () => {
    renderView();
    expect(await screen.findByText('No weigh-ins yet')).toBeInTheDocument();
    expect(screen.getByText('Log your first weigh-in to start tracking.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Chart range' })).toBeNull();
    expect(screen.queryByText('Current')).toBeNull();
    expect(weightInput()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Log weight' }));
    expect(weightInput()).toHaveFocus();
  });

  it('saves 178.4 lb as 80.921 kg for today and toasts', async () => {
    renderView();
    await screen.findByText('No weigh-ins yet');
    await typeWeight('178.4');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const stored = await db.bodyweight.get(bodyweightId(OWNER, todayLocal()));
    expect(stored?.weightKg).toBe(80.921);
    expect(stored?.date).toBe(todayLocal());
    expect(await screen.findByText('Weigh-in saved')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /^Edit weigh-in .*178\.4 lb$/ }),
    ).toBeVisible();
  });

  it('accepts a comma decimal', async () => {
    renderView();
    await screen.findByText('No weigh-ins yet');
    await typeWeight('178,4');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const stored = await db.bodyweight.get(bodyweightId(OWNER, todayLocal()));
    expect(stored?.weightKg).toBe(80.921);
  });

  it('saves a trimmed note', async () => {
    renderView();
    await screen.findByText('No weigh-ins yet');
    await typeWeight('180');
    await userEvent.type(screen.getByLabelText('Note (optional)'), '  after run ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const stored = await db.bodyweight.get(bodyweightId(OWNER, todayLocal()));
    expect(stored?.note).toBe('after run');
  });

  it('prefills the weight from the latest entry', async () => {
    await seed(entry(5, 180), entry(2, 177.6));
    renderView();
    await screen.findByText('Current');
    expect(weightInput()).toHaveValue('177.6');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.queryByText(/Already logged/)).toBeNull();
  });

  it('switches to Update with a helper when the date already has an entry', async () => {
    await seed(entry(0, 178.4), entry(3, 180, 'morning'));
    renderView();
    await screen.findByText('Current');
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
    expect(
      screen.getByText('Already logged 178.4 lb for this day. Saving replaces it.'),
    ).toBeInTheDocument();
    await typeWeight('177.6');
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(await db.bodyweight.count()).toBe(2);
    expect((await db.bodyweight.get(bodyweightId(OWNER, todayLocal())))?.weightKg).toBe(80.558);
  });

  it('preloads weight and note when a past date with an entry is picked', async () => {
    await seed(entry(0, 178.4), entry(3, 180, 'morning'));
    renderView();
    await screen.findByText('Current');
    const past = dateAgo(3);
    await userEvent.clear(dateInput());
    await userEvent.type(dateInput(), past);
    expect(dateInput()).toHaveValue(past);
    expect(weightInput()).toHaveValue('180');
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('morning');
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });

  it('keeps a typed weight when the date is changed afterwards', async () => {
    renderView();
    await screen.findByText('No weigh-ins yet');
    await typeWeight('181.2');
    const past = dateAgo(2);
    await userEvent.clear(dateInput());
    await userEvent.type(dateInput(), past);
    expect(weightInput()).toHaveValue('181.2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await db.bodyweight.get(bodyweightId(OWNER, past)))?.weightKg).toBe(82.191);
  });

  it('limits the date to today and disables Save when it is cleared', async () => {
    await seed(entry(1, 180));
    renderView();
    await screen.findByText('Current');
    expect(dateInput()).toHaveAttribute('max', todayLocal());
    expect(dateInput()).toHaveValue(todayLocal());
    await userEvent.clear(dateInput());
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('validates the weight in lb and kg', async () => {
    renderView();
    await screen.findByText('No weigh-ins yet');
    await typeWeight('0');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight above 0');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await typeWeight('1543.3');
    expect(screen.getByRole('alert')).toHaveTextContent('Weight must be under 1543.2 lb');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await typeWeight('180');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    act(() => {
      setSettings('kg');
    });
    await typeWeight('700', 'kg');
    expect(screen.getByRole('alert')).toHaveTextContent('Weight must be under 700 kg');
    await typeWeight('699.9', 'kg');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses 16px text on the inputs', async () => {
    renderView();
    await screen.findByText('No weigh-ins yet');
    for (const el of [weightInput(), dateInput(), screen.getByLabelText('Note (optional)')]) {
      expect(el.className).toContain('text-[16px]');
    }
  });
});

describe('chart, range and stats', () => {
  it('shows the fallback hint and Change · All when the range has fewer than 2 entries', async () => {
    await seed(entry(60, 180), entry(10, 177.6));
    useProgressViewStore.setState({ bodyweightRange: '1M' });
    renderView();
    expect(
      await screen.findByText('Fewer than 2 weigh-ins in this range. Showing all time.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1M' })).toBeChecked();
    expect(tile('Change · All')).toHaveTextContent('↓ 2.4 lb');
  });

  it('renders stats with an arrow and neutral values', async () => {
    await seed(entry(20, 180), entry(10, 178), entry(0, 177.6));
    renderView();
    await screen.findByText('Current');
    expect(tile('Current')).toHaveTextContent('177.6 lb');
    expect(tile('Current')).toHaveTextContent('Today');
    expect(tile('Change · 3M')).toHaveTextContent('↓ 2.4 lb');
    expect(tile('Change · 3M')).toHaveTextContent('−1%');
    expect(tile('Min')).toHaveTextContent('177.6 lb');
    expect(tile('Max')).toHaveTextContent('180 lb');
    expect(tile('Average')).toHaveTextContent('178.5 lb');
  });

  it('shows an up arrow when weight rose and a dash for a single entry', async () => {
    await seed(entry(10, 170), entry(0, 171));
    const first = renderView();
    await screen.findByText('Current');
    expect(tile('Change · 3M')).toHaveTextContent('↑ 1 lb');
    first.unmount();

    await db.bodyweight.clear();
    await seed(entry(0, 171));
    renderView();
    await screen.findByText('Current');
    expect(tile('Change · 3M')).toHaveTextContent('—');
    expect(tile('Change · 3M')).toHaveTextContent('Need 2+ weigh-ins');
  });

  it('draws the goal line when a goal is set', async () => {
    setSettings('lb', fromDisplay(170, 'lb'));
    await seed(entry(10, 180), entry(0, 177.6));
    const { container } = renderView();
    await screen.findByText('Current');
    expect(container.querySelector('.lift-bw-goal')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Set a goal' })).toBeNull();
  });

  it('links to settings when there is no goal', async () => {
    await seed(entry(10, 180), entry(0, 177.6));
    const { container } = renderView();
    await screen.findByText('Current');
    expect(container.querySelector('.lift-bw-goal')).toBeNull();
    const link = screen.getByRole('link', { name: 'Set a goal' });
    expect(link).toHaveAttribute('href', '/settings');
    await userEvent.click(link);
    expect(screen.getByText('Settings page')).toBeInTheDocument();
  });

  it('keeps the range in the store', async () => {
    await seed(entry(10, 180), entry(0, 177.6));
    renderView();
    await screen.findByText('Current');
    await userEvent.click(screen.getByRole('radio', { name: '6M' }));
    expect(useProgressViewStore.getState().bodyweightRange).toBe('6M');
    expect(useProgressViewStore.getState().range).toBe('3M');
  });
});

describe('entries list', () => {
  it('lists entries newest first with notes', async () => {
    await seed(entry(9, 180), entry(0, 177.6, 'fasted'), entry(4, 179));
    renderView();
    await screen.findByText('Current');
    expect(rows().map((r) => r.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/, 177\.6 lb$/),
      expect.stringMatching(/, 179 lb$/),
      expect.stringMatching(/, 180 lb$/),
    ]);
    expect(within(rows()[0] as HTMLElement).getByText('fasted')).toBeInTheDocument();
  });

  it('pages after 30 entries with Show more', async () => {
    await seed(...Array.from({ length: 35 }, (_, i) => entry(i, 180 - i * 0.1)));
    renderView();
    await screen.findByText('Current');
    expect(rows()).toHaveLength(30);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(rows()).toHaveLength(35);
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('opens the edit sheet without a date field and saves changes', async () => {
    await seed(entry(3, 180, 'old'), entry(0, 178));
    renderView();
    await screen.findByText('Current');
    await userEvent.click(rows()[1] as HTMLElement);
    const sheet = screen.getByRole('dialog', { name: /^Edit weigh-in · / });
    expect(within(sheet).queryByLabelText('Date')).toBeNull();
    expect(within(sheet).getByRole('textbox', { name: 'Weight in lb' })).toHaveValue('180');
    expect(within(sheet).getByLabelText('Note (optional)')).toHaveValue('old');

    const input = within(sheet).getByRole('textbox', { name: 'Weight in lb' });
    await userEvent.clear(input);
    await userEvent.type(input, '179.2');
    await userEvent.clear(within(sheet).getByLabelText('Note (optional)'));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const stored = await db.bodyweight.get(bodyweightId(OWNER, dateAgo(3)));
    expect(stored?.weightKg).toBe(81.284);
    expect(stored?.note).toBeUndefined();
    expect(stored?.createdAt).toBe(1);
  });

  it('disables sheet Save for an invalid weight', async () => {
    await seed(entry(0, 178));
    renderView();
    await screen.findByText('Current');
    await userEvent.click(rows()[0] as HTMLElement);
    const sheet = screen.getByRole('dialog');
    const input = within(sheet).getByRole('textbox', { name: 'Weight in lb' });
    await userEvent.clear(input);
    await userEvent.type(input, '0');
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Enter a weight above 0');
    expect(within(sheet).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('deletes from the sheet, toasts, and Undo restores the entry', async () => {
    await seed(entry(3, 180), entry(0, 178));
    renderView();
    await screen.findByText('Current');
    await userEvent.click(rows()[1] as HTMLElement);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('Weigh-in deleted')).toBeInTheDocument();
    expect(await db.bodyweight.count()).toBe(1);
    await waitFor(() => {
      expect(rows()).toHaveLength(1);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await db.bodyweight.count()).toBe(2);
    await waitFor(() => {
      expect(rows()).toHaveLength(2);
    });
  });

  it('toasts when Undo cannot restore because the day was logged again', async () => {
    const e = entry(0, 178);
    await seed(e);
    renderView();
    await screen.findByText('Current');
    await userEvent.click(rows()[0] as HTMLElement);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );
    await screen.findByText('Weigh-in deleted');
    await db.bodyweight.put({ ...e, weightKg: 70, updatedAt: 5 });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      await screen.findByText('Couldn’t undo — this day was logged again.'),
    ).toBeInTheDocument();
    expect((await db.bodyweight.get(e.id))?.weightKg).toBe(70);
  });

  it('uses the same delete and undo handler for the swipe delete button', async () => {
    await seed(entry(3, 180), entry(0, 178));
    renderView();
    await screen.findByText('Current');
    const label = (rows()[1] as HTMLElement).getAttribute('aria-label') ?? '';
    const date = label.replace(/^Edit weigh-in /, '').replace(/, 180 lb$/, '');
    await userEvent.click(screen.getByLabelText(`Delete weigh-in ${date}`));
    expect(await screen.findByText('Weigh-in deleted')).toBeInTheDocument();
    expect(await db.bodyweight.count()).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await db.bodyweight.count()).toBe(2);
  });

  it('returns to the empty state after deleting the only entry', async () => {
    await seed(entry(0, 178));
    renderView();
    await screen.findByText('Current');
    await userEvent.click(rows()[0] as HTMLElement);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );
    expect(await screen.findByText('No weigh-ins yet')).toBeInTheDocument();
  });
});
