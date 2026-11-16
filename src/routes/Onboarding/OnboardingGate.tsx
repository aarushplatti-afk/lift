import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { observeOnboardingCounts, type OnboardingCounts } from '../../db/repos/onboarding';
import { shouldShowOnboarding } from '../../lib/onboarding';
import { useSettingsStore } from '../../store/settings';

const WelcomeSheet = lazy(() =>
  import('./WelcomeSheet').then((m) => ({ default: m.WelcomeSheet })),
);

export function OnboardingGate() {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const onboardedAt = useSettingsStore((s) => s.settings.onboardedAt);
  const [counts, setCounts] = useState<OnboardingCounts | null>(null);
  const [open, setOpen] = useState(false);
  const closed = useRef(false);

  useEffect(() => {
    const sub = observeOnboardingCounts().subscribe({ next: setCounts, error: () => undefined });
    return () => {
      sub.unsubscribe();
    };
  }, []);

  const show =
    counts !== null && shouldShowOnboarding({ settingsHydrated: hydrated, onboardedAt, ...counts });

  useEffect(() => {
    if (show && !closed.current) setOpen(true);
  }, [show]);

  if (!open || onboardedAt !== undefined) return null;
  return (
    <Suspense fallback={null}>
      <WelcomeSheet
        onDone={() => {
          closed.current = true;
          setOpen(false);
        }}
      />
    </Suspense>
  );
}
