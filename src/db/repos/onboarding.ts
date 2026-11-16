import { liveQuery, type Observable } from 'dexie';
import { db } from '../schema';
import { upsertForDate } from './bodyweight';
import { updateSettings } from './settings';
import { addStarterTemplates } from './templates';
import { todayLocal } from '../../lib/dates';
import type { Unit } from '../../types/domain';

export interface OnboardingCounts {
  workouts: number;
  templates: number;
  bodyweight: number;
}

export interface OnboardingChoice {
  unit: Unit;
  bodyweightKg?: number;
  addStarterTemplates: boolean;
}

export interface OnboardingOutcome {
  bodyweightSaved: boolean;
  templatesAdded: number;
}

async function countAll(): Promise<OnboardingCounts> {
  const [workouts, templates, bodyweight] = await Promise.all([
    db.workouts.count(),
    db.templates.count(),
    db.bodyweight.count(),
  ]);
  return { workouts, templates, bodyweight };
}

export function observeOnboardingCounts(): Observable<OnboardingCounts> {
  return liveQuery(countAll);
}

export async function completeOnboarding(
  choice: OnboardingChoice,
  now: number,
): Promise<OnboardingOutcome> {
  const templatesAdded = choice.addStarterTemplates ? await addStarterTemplates(now) : 0;
  let bodyweightSaved = false;
  if (choice.bodyweightKg !== undefined) {
    const res = await upsertForDate(todayLocal(now), choice.bodyweightKg);
    bodyweightSaved = res.ok;
  }
  await updateSettings({ unit: choice.unit, onboardedAt: now });
  return { bodyweightSaved, templatesAdded };
}

export async function skipOnboarding(now: number): Promise<void> {
  await updateSettings({ onboardedAt: now });
}
