import { describe, expect, it } from 'vitest';
import { SEED_EXERCISES } from '../../db/seedData';
import { nameKey } from '../exercises';
import { buildStarterExercises, STARTER_TEMPLATES } from '../starterTemplates';

describe('STARTER_TEMPLATES', () => {
  it('has push, pull, legs with every exercise in the seed list', () => {
    expect(STARTER_TEMPLATES.map((t) => t.key)).toEqual(['push', 'pull', 'legs']);
    const seed = new Set(SEED_EXERCISES.map((e) => nameKey(e.name)));
    for (const t of STARTER_TEMPLATES) {
      for (const e of t.exercises) expect(seed.has(nameKey(e.name))).toBe(true);
    }
  });
});

describe('buildStarterExercises', () => {
  const push = STARTER_TEMPLATES[0];
  if (!push) throw new Error('missing push');

  it('builds normal sets with reps targets and contiguous order', () => {
    const out = buildStarterExercises(push, (n) => `id:${n}`);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({
      exerciseId: 'id:Barbell Bench Press',
      order: 0,
      sets: [
        { type: 'normal', targetReps: 8 },
        { type: 'normal', targetReps: 8 },
        { type: 'normal', targetReps: 8 },
      ],
    });
    expect(out.map((e) => e.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('skips unresolved names and renumbers', () => {
    const out = buildStarterExercises(push, (n) =>
      n === 'Lateral Raise' || n === 'Barbell Bench Press' ? n : undefined,
    );
    expect(out.map((e) => [e.exerciseId, e.order])).toEqual([
      ['Barbell Bench Press', 0],
      ['Lateral Raise', 1],
    ]);
  });

  it('returns empty when nothing resolves', () => {
    expect(buildStarterExercises(push, () => undefined)).toEqual([]);
  });
});
