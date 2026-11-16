export interface OnboardingInputs {
  settingsHydrated: boolean;
  onboardedAt?: number;
  workouts: number;
  templates: number;
  bodyweight: number;
}

export function shouldShowOnboarding(i: OnboardingInputs): boolean {
  return (
    i.settingsHydrated &&
    i.onboardedAt === undefined &&
    i.workouts === 0 &&
    i.templates === 0 &&
    i.bodyweight === 0
  );
}
