import { v5 } from 'uuid';
import type { StarterKey } from './starterTemplates';

export const LIFT_NS = '6f1d3c52-9a4e-4b87-b2d0-7e5a18c93f64';

export function newId(): string {
  return crypto.randomUUID();
}

export function userNamespace(userId: string): string {
  return v5(userId, LIFT_NS);
}

export function seededExerciseId(userId: string, name: string): string {
  return v5(name.trim().toLowerCase(), userNamespace(userId));
}

export function bodyweightId(userId: string, date: string): string {
  return v5(date, userNamespace(userId));
}

export function starterTemplateId(userId: string, key: StarterKey): string {
  return v5(`starter-template:${key}`, userNamespace(userId));
}
