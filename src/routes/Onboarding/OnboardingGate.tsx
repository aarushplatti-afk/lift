import { lazy, Suspense, useEffect, useState } from 'react';
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
  const [closed, setClosed] = useState(false);
  if (onboardedAt !== undefined && !closed) setClosed(true);

  useEffect(() => {
    const sub = observeOnboardingCounts().subscribe({ next: setCounts, error: () => undefined });
    return () => {
      sub.unsubscribe();
    };
  }, []);

  const show =
    counts !== null && shouldShowOnboarding({ settingsHydrated: hydrated, onboardedAt, ...counts });

  if (show && !closed && !open) setOpen(true);

  if (!open || closed) return null;
  return (
    <Suspense fallback={null}>
      <WelcomeSheet
        onDone={() => {
          setClosed(true);
          setOpen(false);
        }}
      />
    </Suspense>
  );
}
