import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BottomSheet } from './BottomSheet';
import { Chip, ChipGroup } from './Chip';
import { ListRow } from './ListRow';
import { SearchInput } from './SearchInput';
import { Select } from './Select';
import { TextArea } from './TextArea';

describe('BottomSheet', () => {
  function Harness({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
        >
          Open
        </button>
        <BottomSheet
          open={open}
          title="Filters"
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
          footer={<button type="button">Apply</button>}
        >
          <p>Body</p>
        </BottomSheet>
      </>
    );
  }

  it('focuses title, locks scroll, closes on Escape and returns focus', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Filters' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('closes on backdrop click but not on panel click', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    render(
      <BottomSheet open={false} title="X" onClose={vi.fn()}>
        <p>Hidden</p>
      </BottomSheet>,
    );
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});

describe('Chip and ChipGroup', () => {
  it('Chip exposes aria-pressed', async () => {
    const onClick = vi.fn();
    render(
      <Chip selected onClick={onClick}>
        Legs
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Legs' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ChipGroup has radio semantics and arrow-key navigation', async () => {
    const onChange = vi.fn();
    render(
      <ChipGroup
        label="Muscle"
        options={[
          { value: 'all', label: 'All' },
          { value: 'chest', label: 'Chest' },
        ]}
        value="all"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Muscle' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Chest' })).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(screen.getByRole('radio', { name: 'Chest' }));
    expect(onChange).toHaveBeenLastCalledWith('chest');
    screen.getByRole('radio', { name: 'All' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('chest');
    expect(screen.getByRole('radio', { name: 'Chest' })).toHaveFocus();
  });
});

describe('SearchInput', () => {
  it('shows a clear button only with a value and clears', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SearchInput label="Search exercises" value="" onChange={onChange} />,
    );
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
    rerender(<SearchInput label="Search exercises" value="bench" onChange={onChange} />);
    expect(screen.getByLabelText('Search exercises')).toHaveValue('bench');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('reports typed input', async () => {
    const onChange = vi.fn();
    render(<SearchInput label="Search" value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });
});

describe('ListRow', () => {
  it('is a checkbox with aria-checked when checked is defined', async () => {
    const onClick = vi.fn();
    render(<ListRow title="Squat" subtitle="Legs" trailing="3" checked onClick={onClick} />);
    const row = screen.getByRole('checkbox', { name: /Squat/ });
    expect(row).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is a plain button when checked is undefined', () => {
    render(<ListRow title="Row" dimmed />);
    expect(screen.getByRole('button', { name: 'Row' })).not.toHaveAttribute('aria-checked');
  });

  it('renders a link when to is set', () => {
    render(
      <MemoryRouter>
        <ListRow title="Deadlift" to="/exercises/1" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Deadlift' })).toHaveAttribute('href', '/exercises/1');
  });
});

describe('Select and TextArea', () => {
  it('Select associates label and renders error', () => {
    render(
      <Select label="Equipment" error="Choose equipment.">
        <option value="">Choose...</option>
      </Select>,
    );
    const select = screen.getByLabelText('Equipment');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Choose equipment.');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose equipment.');
  });

  it('Select has no error markup by default', () => {
    render(
      <Select label="Type">
        <option value="a">A</option>
      </Select>,
    );
    expect(screen.getByLabelText('Type')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('TextArea associates label, error and shows counter', () => {
    render(
      <TextArea label="Notes" value="abc" maxLength={500} error="Too long." onChange={vi.fn()} />,
    );
    const area = screen.getByLabelText('Notes');
    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(area).toHaveAccessibleDescription('Too long.');
    expect(screen.getByText('3/500')).toBeInTheDocument();
  });
});
