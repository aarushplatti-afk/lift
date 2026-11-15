// iOS standalone PWAs sometimes start (or resume) with a layout viewport that is
// shorter than the screen by about the status-bar height, so `position: fixed;
// bottom: 0` elements such as the tab bar float above the bottom edge until
// something forces WebKit to re-measure. We detect that and force a re-layout.

const TOLERANCE_PX = 4;

interface ViewportSample {
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
  portrait: boolean;
}

export function isViewportShort(s: ViewportSample): boolean {
  const expected = s.portrait
    ? Math.max(s.screenWidth, s.screenHeight)
    : Math.min(s.screenWidth, s.screenHeight);
  return expected - s.innerHeight > TOLERANCE_PX;
}

function isIosStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function sample(): ViewportSample {
  return {
    innerHeight: window.innerHeight,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    portrait: window.matchMedia('(orientation: portrait)').matches,
  };
}

export function isEditing(active: Element | null): boolean {
  if (!(active instanceof HTMLElement)) return false;
  if (active.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
}

export function nudgeLayout(root: HTMLElement): void {
  const x = window.scrollX;
  const y = window.scrollY;
  const active = document.activeElement;
  root.style.display = 'none';
  void root.offsetHeight;
  root.style.display = '';
  window.scrollTo(x, y);
  if (active instanceof HTMLElement && active !== document.body) {
    active.focus({ preventScroll: true });
  }
}

const MAX_INEFFECTIVE_NUDGES = 3;

export function installViewportFix(root: HTMLElement): void {
  if (!isIosStandalone()) return;
  let ineffective = 0;
  const check = () => {
    if (ineffective >= MAX_INEFFECTIVE_NUDGES) return;
    if (isEditing(document.activeElement)) return;
    const vv = window.visualViewport;
    if (vv && window.innerHeight - vv.height > 100) return;
    const before = sample();
    if (!isViewportShort(before)) return;
    nudgeLayout(root);
    if (window.innerHeight === before.innerHeight) ineffective += 1;
    else ineffective = 0;
  };
  const soon = () => {
    requestAnimationFrame(check);
    window.setTimeout(check, 300);
    window.setTimeout(check, 1000);
  };
  soon();
  window.addEventListener('pageshow', soon);
  window.addEventListener('orientationchange', soon);
  window.visualViewport?.addEventListener('resize', () => window.setTimeout(check, 150));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') soon();
  });
}

// Supabase's implicit flow (detectSessionInUrl is off) returns tokens in the hash,
// which HashRouter would treat as a route; drop them from the URL and history.
export function stripAuthRedirectHash(): void {
  const { hash, pathname, search } = window.location;
  if (/^#(access_token|error|error_code)=/.test(hash)) {
    window.history.replaceState(null, '', `${pathname}${search}#/`);
  }
}
