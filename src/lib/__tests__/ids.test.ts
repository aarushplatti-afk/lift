import { describe, expect, it } from 'vitest';
import { LIFT_NS, bodyweightId, newId, seededExerciseId, userNamespace } from '../ids';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('ids', () => {
  it('LIFT_NS is a uuid', () => {
    expect(LIFT_NS).toMatch(UUID);
  });
  it('newId is unique and valid', () => {
    const a = newId();
    expect(a).toMatch(UUID);
    expect(newId()).not.toBe(a);
  });
  it('userNamespace is deterministic and per user', () => {
    expect(userNamespace(A)).toBe(userNamespace(A));
    expect(userNamespace(A)).not.toBe(userNamespace(B));
  });
  it('seededExerciseId normalizes name and is per user', () => {
    expect(seededExerciseId(A, ' Bench Press ')).toBe(seededExerciseId(A, 'bench press'));
    expect(seededExerciseId(A, 'Squat')).not.toBe(seededExerciseId(B, 'Squat'));
    expect(seededExerciseId(A, 'Squat')).not.toBe(seededExerciseId(A, 'Deadlift'));
    expect(seededExerciseId(A, 'Squat')).toMatch(UUID);
  });
  it('bodyweightId is deterministic per user and date', () => {
    expect(bodyweightId(A, '2026-01-01')).toBe(bodyweightId(A, '2026-01-01'));
    expect(bodyweightId(A, '2026-01-01')).not.toBe(bodyweightId(A, '2026-01-02'));
    expect(bodyweightId(A, '2026-01-01')).not.toBe(bodyweightId(B, '2026-01-01'));
  });
});
