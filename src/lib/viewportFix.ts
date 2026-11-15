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

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function sample(): ViewportSample {
  return {
    innerHeight: window.innerHeight,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    portrait: window.matchMedia('(orientation: portrait)').matches,
  };
}

export function nudgeLayout(root: HTMLElement): void {
  const x = window.scrollX;
  const y = window.scrollY;
  root.style.display = 'none';
  void root.offsetHeight;
  root.style.display = '';
  window.scrollTo(x, y);
}

export function installViewportFix(root: HTMLElement): void {
  if (!isStandalone()) return;
  const check = () => {
    if (isViewportShort(sample())) nudgeLayout(root);
  };
  const soon = () => {
    requestAnimationFrame(check);
    window.setTimeout(check, 300);
    window.setTimeout(check, 1000);
  };
  soon();
  window.addEventListener('pageshow', soon);
  window.addEventListener('orientationchange', soon);
  window.addEventListener('focusout', () => window.setTimeout(check, 150));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') soon();
  });
}

export function stripAuthRedirectHash(): void {
  const { hash, pathname, search } = window.location;
  if (/^#(access_token|error|error_code)=/.test(hash)) {
    window.history.replaceState(null, '', `${pathname}${search}#/`);
  }
}
