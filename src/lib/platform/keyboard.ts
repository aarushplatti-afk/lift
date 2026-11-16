const KEYBOARD_THRESHOLD_PX = 120;
const NON_TEXT_INPUTS = ['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'file'];

export function isKeyboardOpen(innerHeight: number, visualHeight: number): boolean {
  return innerHeight - visualHeight > KEYBOARD_THRESHOLD_PX;
}

function isEditable(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

export function installKeyboardHandling(): () => void {
  const vv = typeof window === 'undefined' ? null : (window.visualViewport ?? null);
  if (!vv) return () => undefined;
  const root = document.documentElement;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const reveal = (): void => {
    const el = document.activeElement;
    if (!isEditable(el)) return;
    const rect = el.getBoundingClientRect();
    const top = vv.offsetTop;
    if (rect.bottom > top + vv.height || rect.top < top) {
      el.scrollIntoView({ block: 'center' });
    }
  };

  const update = (): void => {
    if (isKeyboardOpen(window.innerHeight, vv.height)) root.dataset.keyboard = 'open';
    else delete root.dataset.keyboard;
  };

  const onResize = (): void => {
    update();
    reveal();
  };
  const onFocusIn = (): void => {
    update();
    clearTimeout(timer);
    timer = setTimeout(reveal, 300);
  };

  vv.addEventListener('resize', onResize);
  document.addEventListener('focusin', onFocusIn);
  update();

  return () => {
    clearTimeout(timer);
    vv.removeEventListener('resize', onResize);
    document.removeEventListener('focusin', onFocusIn);
    delete root.dataset.keyboard;
  };
}
