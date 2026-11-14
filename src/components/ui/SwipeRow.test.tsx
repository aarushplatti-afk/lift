import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Stepper } from './Stepper';
import { SwipeRow } from './SwipeRow';
import { Toggle } from './Toggle';

function swipe(el: Element, dx: number, dy = 0) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 300, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 300 + dx, clientY: 100 + dy });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 300 + dx, clientY: 100 + dy });
}

function mockWidth(content: HTMLElement) {
  vi.spyOn(content.parentElement as HTMLElement, 'getBoundingClientRect').mockReturnValue({
    width: 390,
  } as DOMRect);
}

function setup(props: { disabled?: boolean } = {}) {
  const onDelete = vi.fn();
  render(
    <SwipeRow onDelete={onDelete} deleteLabel="Delete" {...props}>
      <div data-testid="content">Row</div>
    </SwipeRow>,
  );
  const content = screen.getByTestId('content').parentElement as HTMLElement;
  mockWidth(content);
  return { onDelete, content };
}

describe('SwipeRow', () => {
  it('deletes immediately when swiped past half the width', () => {
    const { onDelete, content } = setup();
    swipe(content, -250);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('reveals the Delete button at 80 px and it deletes', async () => {
    const { onDelete, content } = setup();
    const btn = screen.getByText('Delete', { selector: 'button' });
    expect(btn).toHaveAttribute('aria-hidden', 'true');
    expect(btn).toHaveAttribute('tabindex', '-1');
    swipe(content, -100);
    expect(onDelete).not.toHaveBeenCalled();
    expect(btn).not.toHaveAttribute('aria-hidden');
    expect(btn).toHaveAttribute('tabindex', '0');
    await userEvent.click(btn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('snaps back on a short swipe', () => {
    const { onDelete, content } = setup();
    swipe(content, -40);
    expect(onDelete).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('translateX(0px)');
    expect(screen.getByText('Delete', { selector: 'button' })).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('never locks horizontal on a vertical drag', () => {
    const { onDelete, content } = setup();
    fireEvent.pointerDown(content, { pointerId: 1, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(content, { pointerId: 1, clientX: 290, clientY: 140 });
    fireEvent.pointerMove(content, { pointerId: 1, clientX: 100, clientY: 150 });
    fireEvent.pointerUp(content, { pointerId: 1, clientX: 100, clientY: 150 });
    expect(onDelete).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('translateX(0px)');
  });

  it('ignores mouse drags that start inside an input but not touch swipes', () => {
    const onDelete = vi.fn();
    render(
      <SwipeRow onDelete={onDelete} deleteLabel="Delete set 1">
        <input data-testid="field" aria-label="Weight" />
      </SwipeRow>,
    );
    const field = screen.getByTestId('field');
    const content = field.parentElement as HTMLElement;
    mockWidth(content);
    fireEvent.pointerDown(field, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 300,
      clientY: 100,
    });
    fireEvent.pointerMove(field, { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 100 });
    fireEvent.pointerUp(field, { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 100 });
    expect(onDelete).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('translateX(0px)');
    fireEvent.pointerDown(field, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 300,
      clientY: 100,
    });
    fireEvent.pointerMove(field, { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 100 });
    fireEvent.pointerUp(field, { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 100 });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('shows short visible text with the full aria-label', () => {
    render(
      <SwipeRow onDelete={vi.fn()} deleteLabel="Delete set 3">
        <div>Row</div>
      </SwipeRow>,
    );
    const btn = screen.getByText('Delete', { selector: 'button' });
    expect(btn).toHaveAttribute('aria-label', 'Delete set 3');
  });

  it('ignores swipes when disabled', () => {
    const { onDelete, content } = setup({ disabled: true });
    swipe(content, -250);
    expect(onDelete).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('translateX(0px)');
  });

  it('closes on an outside tap', () => {
    const { content } = setup();
    swipe(content, -100);
    expect(content.style.transform).toBe('translateX(-80px)');
    fireEvent.pointerDown(document.body);
    expect(content.style.transform).toBe('translateX(0px)');
  });

  it('keeps only one row open at a time', () => {
    render(
      <>
        <SwipeRow onDelete={vi.fn()} deleteLabel="Delete A">
          <div data-testid="a">A</div>
        </SwipeRow>
        <SwipeRow onDelete={vi.fn()} deleteLabel="Delete B">
          <div data-testid="b">B</div>
        </SwipeRow>
      </>,
    );
    const a = screen.getByTestId('a').parentElement as HTMLElement;
    const b = screen.getByTestId('b').parentElement as HTMLElement;
    mockWidth(a);
    mockWidth(b);
    swipe(a, -100);
    expect(a.style.transform).toBe('translateX(-80px)');
    swipe(b, -100);
    expect(b.style.transform).toBe('translateX(-80px)');
    expect(a.style.transform).toBe('translateX(0px)');
  });
});

describe('Toggle', () => {
  it('exposes switch semantics and toggles', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Sound" description="Beep at zero" checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Sound' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toHaveAccessibleDescription('Beep at zero');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not fire when disabled', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Sound" checked disabled onChange={onChange} />);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Stepper', () => {
  function Harness({ start }: { start: number }) {
    const [v, setV] = useState(start);
    return (
      <Stepper
        label="Rest"
        value={v}
        min={30}
        max={60}
        step={15}
        format={(n) => `${String(n)}s`}
        onChange={setV}
      />
    );
  }

  it('steps within bounds and disables at the limits', async () => {
    render(<Harness start={45} />);
    const dec = screen.getByRole('button', { name: 'Decrease Rest' });
    const inc = screen.getByRole('button', { name: 'Increase Rest' });
    expect(screen.getByText('45s')).toHaveAttribute('aria-live', 'polite');
    await userEvent.click(inc);
    expect(screen.getByText('60s')).toBeInTheDocument();
    expect(inc).toBeDisabled();
    await userEvent.click(dec);
    await userEvent.click(dec);
    expect(screen.getByText('30s')).toBeInTheDocument();
    expect(dec).toBeDisabled();
  });
});
