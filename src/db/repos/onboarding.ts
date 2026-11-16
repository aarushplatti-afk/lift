import { liveQuery, type Observable } from 'dexie';
import { db } from '../schema';
import { upsertForDate } from './bodyweight';
import { requireUserId } from './meta';
import { updateSettings } from './settings';
import { addStarterTemplates } from './templates';
import { todayLocal } from '../../lib/dates';
import { starterTemplateId } from '../../lib/ids';
import { STARTER_TEMPLATES } from '../../lib/starterTemplates';
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
  /** Starter templates were requested but none were added and none already exist. */
  templatesFailed: boolean;
}

async function hasStarterTemplate(): Promise<boolean> {
  const userId = await requireUserId();
  const found = await db.templates.bulkGet(
    STARTER_TEMPLATES.map((t) => starterTemplateId(userId, t.key)),
  );
  return found.some((t) => t !== undefined);
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
  const templatesFailed =
    choice.addStarterTemplates && templatesAdded === 0 && !(await hasStarterTemplate());
  let bodyweightSaved = false;
  if (choice.bodyweightKg !== undefined) {
    const res = await upsertForDate(todayLocal(now), choice.bodyweightKg);
    bodyweightSaved = res.ok;
  }
  await updateSettings({ unit: choice.unit, onboardedAt: now });
  return { bodyweightSaved, templatesAdded, templatesFailed };
}

export async function skipOnboarding(now: number): Promise<void> {
  await updateSettings({ onboardedAt: now });
}
