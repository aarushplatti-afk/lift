import { describe, expect, it } from 'vitest';
import { shouldShowOnboarding, type OnboardingInputs } from '../onboarding';

const base: OnboardingInputs = {
  settingsHydrated: true,
  workouts: 0,
  templates: 0,
  bodyweight: 0,
};

describe('shouldShowOnboarding', () => {
  it('shows only for a hydrated, unflagged, empty account', () => {
    expect(shouldShowOnboarding(base)).toBe(true);
  });
  it('hides when not hydrated', () => {
    expect(shouldShowOnboarding({ ...base, settingsHydrated: false })).toBe(false);
  });
  it('hides when flagged', () => {
    expect(shouldShowOnboarding({ ...base, onboardedAt: 1 })).toBe(false);
  });
  it.each(['workouts', 'templates', 'bodyweight'] as const)('hides with any %s', (k) => {
    expect(shouldShowOnboarding({ ...base, [k]: 1 })).toBe(false);
  });
});
