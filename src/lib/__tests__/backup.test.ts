import { v5 } from 'uuid';
import { DEFAULT_SETTINGS } from '../../db/repos/settings';
import notJsonRaw from '../../test/fixtures/backups/not-json.txt?raw';
import schemaV2Raw from '../../test/fixtures/backups/schema-v2.json?raw';
import validRaw from '../../test/fixtures/backups/valid.json?raw';
import wrongFormatRaw from '../../test/fixtures/backups/wrong-format.json?raw';
import {
  BACKUP_MAX_BYTES,
  backupFileName,
  buildBackup,
  parseBackup,
  remapForUser,
  summarizeBackup,
  type LiftBackup,
} from '../backup';
import { bodyweightId, seededExerciseId, userNamespace } from '../ids';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const BENCH = 'aaaaaaaa-0000-4000-8000-000000000001';
const FLY = 'aaaaaaaa-0000-4000-8000-000000000002';
const WORKOUT = 'bbbbbbbb-0000-4000-8000-000000000001';
const TEMPLATE = 'cccccccc-0000-4000-8000-000000000001';
const SET0 = 'workouts.0.exercises.0.sets.0';

type Doc = Record<string, unknown>;

function locate(doc: Doc, path: string): { parent: Doc; key: string } {
  const keys = path.split('.');
  const key = keys.pop() ?? '';
  let parent: unknown = doc;
  for (const k of keys) parent = (parent as Doc)[k];
  return { parent: parent as Doc, key };
}

function set(doc: Doc, path: string, value: unknown): void {
  const { parent, key } = locate(doc, path);
  parent[key] = value;
}

function remove(doc: Doc, path: string): void {
  const { parent, key } = locate(doc, path);
  delete parent[key];
}

function get(doc: Doc, path: string): unknown {
  const { parent, key } = locate(doc, path);
  return parent[key];
}

function parseOf(mutate: (doc: Doc) => void) {
  const doc = JSON.parse(validRaw) as Doc;
  mutate(doc);
  return parseBackup(JSON.stringify(doc));
}

function valid(): LiftBackup {
  const r = parseBackup(validRaw);
  if (!r.ok) throw new Error(r.error);
  return r.backup;
}

describe('parseBackup', () => {
  it('accepts the valid fixture and keeps stored data intact', () => {
    const b = valid();
    expect(b.exercises).toHaveLength(2);
    expect(b.workouts[0]?.exercises[0]?.sets[1]?.isPR).toBe(true);
    expect(b.settings.unit).toBe('kg');
  });

  it('accepts a UTF-8 BOM', () => {
    expect(parseBackup('﻿' + validRaw).ok).toBe(true);
  });

  it('accepts an empty account', () => {
    const r = parseOf((d) => {
      d.exercises = [];
      d.workouts = [];
      d.templates = [];
      d.bodyweight = [];
      d.settings = {};
    });
    expect(r.ok).toBe(true);
  });

  it('round-trips buildBackup through JSON exactly', () => {
    const original = valid();
    const built = buildBackup(original, {
      userId: original.userId,
      exportedAt: Date.parse(original.exportedAt),
      appVersion: original.appVersion,
    });
    const again = parseBackup(JSON.stringify(built, null, 2));
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.backup).toEqual(original);
  });

  it('round-trips onboardedAt and accepts a backup without it', () => {
    const original = valid();
    expect(original.settings.onboardedAt).toBeUndefined();
    const withFlag = parseOf((d) => {
      (d.settings as Doc).onboardedAt = 1_700_000_000_000;
    });
    expect(withFlag.ok && withFlag.backup.settings.onboardedAt).toBe(1_700_000_000_000);
    if (withFlag.ok) {
      const again = parseBackup(
        JSON.stringify(
          buildBackup(withFlag.backup, {
            userId: withFlag.backup.userId,
            exportedAt: 1,
            appVersion: 'x',
          }),
        ),
      );
      expect(again.ok && again.backup.settings.onboardedAt).toBe(1_700_000_000_000);
    }
  });

  it.each([0, -1, 1.5])('rejects onboardedAt %s', (v) => {
    const r = parseOf((d) => {
      (d.settings as Doc).onboardedAt = v;
    });
    expect(r.ok).toBe(false);
  });

  describe('buildBackup placeholders', () => {
    const META = {
      userId: OWNER,
      exportedAt: Date.parse('2026-11-15T00:00:00.000Z'),
      appVersion: 't',
    };
    const ghostId = (n: number): string => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`;

    function withDangling(ids: { workout: string[]; template: string[] }): LiftBackup {
      const base = valid();
      const w0 = base.workouts[0];
      const t0 = base.templates[0];
      const we = w0?.exercises[0];
      const te = t0?.exercises[0];
      if (!w0 || !t0 || !we || !te) throw new Error('fixture');
      return {
        ...base,
        workouts: [
          {
            ...w0,
            exercises: [
              ...w0.exercises,
              ...ids.workout.map((exerciseId, i) => ({ ...we, id: `x${i}`, exerciseId })),
            ],
          },
        ],
        templates: [
          {
            ...t0,
            exercises: [
              ...t0.exercises,
              ...ids.template.map((exerciseId) => ({ ...te, exerciseId })),
            ],
          },
        ],
      };
    }

    it('synthesises archived placeholders for dangling refs so the backup re-imports', () => {
      const data = withDangling({ workout: [ghostId(1)], template: [ghostId(2), ghostId(1)] });
      expect(parseBackup(JSON.stringify(data)).ok).toBe(false);
      const built = buildBackup(data, META);
      const ghosts = built.exercises.filter((e) => e.id === ghostId(1) || e.id === ghostId(2));
      expect(ghosts.map((g) => g.name)).toEqual(['Unknown exercise', 'Unknown exercise 2']);
      expect(ghosts.every((g) => g.isCustom && g.archived && g.userId === OWNER)).toBe(true);
      expect(parseBackup(JSON.stringify(built)).ok).toBe(true);
    });

    it('de-duplicates against an existing exercise already named Unknown exercise', () => {
      const data = withDangling({ workout: [ghostId(3)], template: [] });
      const first = data.exercises[0];
      if (!first) throw new Error('fixture');
      const named = {
        ...data,
        exercises: [{ ...first, name: 'unknown exercise' }, ...data.exercises.slice(1)],
      };
      const built = buildBackup(named, META);
      expect(built.exercises.find((e) => e.id === ghostId(3))?.name).toBe('Unknown exercise 2');
      expect(parseBackup(JSON.stringify(built)).ok).toBe(true);
    });

    it('leaves a complete snapshot unchanged', () => {
      const base = valid();
      expect(buildBackup(base, META).exercises).toEqual(base.exercises);
    });

    it('always re-imports across generated snapshots', () => {
      for (let seed = 1; seed <= 12; seed++) {
        const count = seed % 5;
        const wIds = Array.from({ length: count }, (_, i) => ghostId(seed * 10 + i));
        const tIds = Array.from({ length: seed % 3 }, (_, i) => ghostId(seed * 10 + 5 + (i % 2)));
        const data = withDangling({ workout: wIds, template: tIds });
        const result = parseBackup(JSON.stringify(buildBackup(data, META)));
        expect(result.ok, `seed ${seed}`).toBe(true);
      }
    });
  });

  describe('rejects', () => {
    it('non-JSON text', () => {
      expect(parseBackup(notJsonRaw)).toMatchObject({
        ok: false,
        error: 'This file is not valid JSON.',
      });
    });

    it('a JSON array and a bare string', () => {
      expect(parseBackup('[]').ok).toBe(false);
      expect(parseBackup('"x"').ok).toBe(false);
    });

    it('the wrong format', () => {
      expect(parseBackup(wrongFormatRaw)).toMatchObject({
        ok: false,
        error: 'This file is not a Lift backup.',
      });
    });

    it('a newer schemaVersion with the newer-version message', () => {
      expect(parseBackup(schemaV2Raw)).toMatchObject({
        ok: false,
        error: 'This backup was made by a newer version of Lift.',
      });
    });

    it('schemaVersion 0', () => {
      expect(parseOf((d) => set(d, 'schemaVersion', 0)).ok).toBe(false);
    });

    it('files over 25 MB', () => {
      expect(parseBackup('x'.repeat(BACKUP_MAX_BYTES + 1))).toMatchObject({ ok: false });
    });

    it('multi-byte text over 25 MB by bytes', () => {
      const r = parseBackup('é'.repeat(Math.floor(BACKUP_MAX_BYTES / 2) + 1));
      expect(r).toMatchObject({ ok: false, error: 'This file is too large to be a Lift backup.' });
    });

    const cases: [string, (d: Doc) => void][] = [
      ['duplicate exercise id', (d) => set(d, 'exercises.1.id', BENCH)],
      [
        'duplicate workout id',
        (d) => set(d, 'workouts', [get(d, 'workouts.0'), get(d, 'workouts.0')]),
      ],
      ['non-guid top-level id', (d) => set(d, 'exercises.0.id', 'not-an-id')],
      ['missing exercise reference', (d) => set(d, 'workouts.0.exercises.0.exerciseId', 'nope')],
      [
        'missing exercise reference in template',
        (d) => set(d, 'templates.0.exercises.0.exerciseId', 'nope'),
      ],
      ['duplicate live name', (d) => set(d, 'exercises.1.name', ' bench  PRESS ')],
      ['bad date', (d) => set(d, 'bodyweight.0.date', '2026-02-30')],
      [
        'duplicate bodyweight date',
        (d) => {
          const e = {
            ...(get(d, 'bodyweight.0') as Doc),
            id: 'dddddddd-0000-4000-8000-000000000002',
          };
          set(d, 'bodyweight', [get(d, 'bodyweight.0'), e]);
        },
      ],
      ['bodyweight 700', (d) => set(d, 'bodyweight.0.weightKg', 700)],
      ['bodyweight zero', (d) => set(d, 'bodyweight.0.weightKg', 0)],
      ['bodyweight note too long', (d) => set(d, 'bodyweight.0.note', 'n'.repeat(201))],
      ['weight 10001', (d) => set(d, `${SET0}.weightKg`, 10001)],
      ['negative weight', (d) => set(d, `${SET0}.weightKg`, -1)],
      ['reps -1', (d) => set(d, `${SET0}.reps`, -1)],
      ['fractional reps', (d) => set(d, `${SET0}.reps`, 1.5)],
      ['negative duration', (d) => set(d, `${SET0}.durationSec`, -1)],
      ['negative order', (d) => set(d, 'workouts.0.exercises.0.order', -1)],
      [
        'endedAt before startedAt',
        (d) => set(d, 'workouts.0.endedAt', (get(d, 'workouts.0.startedAt') as number) - 1),
      ],
      ['missing endedAt', (d) => remove(d, 'workouts.0.endedAt')],
      ['in_progress workout', (d) => set(d, 'workouts.0.status', 'in_progress')],
      ['bad enum', (d) => set(d, 'exercises.0.muscleGroup', 'wings')],
      ['bad set type', (d) => set(d, `${SET0}.type`, 'super')],
      ['bad unit', (d) => set(d, 'settings.unit', 'stone')],
      ['goal 700', (d) => set(d, 'settings.bodyweightGoalKg', 700)],
      ['increment zero', (d) => set(d, 'settings.weightIncrementKg', 0)],
      ['exercise name too long', (d) => set(d, 'exercises.1.name', 'n'.repeat(61))],
      ['exercise notes too long', (d) => set(d, 'exercises.1.notes', 'n'.repeat(501))],
      ['blank exercise name', (d) => set(d, 'exercises.1.name', '   ')],
      ['bad exportedAt', (d) => set(d, 'exportedAt', 'yesterday')],
      ['missing collection', (d) => remove(d, 'templates')],
    ];
    it.each(cases)('%s', (_name, mutate) => {
      const r = parseOf(mutate);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBeTruthy();
        expect(r.issues.length).toBeGreaterThan(0);
      }
    });
  });

  it('reports at most 5 issues with a readable path', () => {
    const r = parseOf((d) => {
      const extra = Array.from({ length: 8 }, (_, i) => ({
        id: `x${i}`,
        order: 2 + i,
        type: 'normal',
        reps: -5,
        completed: true,
      }));
      const sets = get(d, 'workouts.0.exercises.0.sets') as unknown[];
      set(d, 'workouts.0.exercises.0.sets', [...sets, ...extra]);
      set(d, 'workouts.0.exercises.0.sets.1.reps', -1);
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toHaveLength(5);
      expect(r.issues[0]).toMatch(/^workouts\[0\]\.exercises\[0\]\.sets\[1\]\.reps: /);
    }
  });

  it('accepts an archived exercise sharing a live exercise name', () => {
    const r = parseOf((d) => {
      set(d, 'exercises.1.name', 'Bench Press');
      set(d, 'exercises.1.archived', true);
    });
    expect(r.ok).toBe(true);
  });

  describe('normalisation', () => {
    it('drops null optionals, isPR false and unknown keys', () => {
      const r = parseOf((d) => {
        set(d, 'exercises.0.notes', null);
        set(d, 'exercises.0.extra', 'x');
        set(d, 'workouts.0.notes', null);
        set(d, 'workouts.0.templateId', null);
        set(d, 'workouts.0.exercises.0.restSeconds', null);
        set(d, `${SET0}.isPR`, false);
        set(d, `${SET0}.reps`, null);
        set(d, 'bodyweight.0.note', null);
        set(d, 'settings.bodyweightGoalKg', null);
        set(d, 'mystery', 1);
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const b = r.backup;
      expect('notes' in (b.exercises[0] ?? {})).toBe(false);
      expect('extra' in (b.exercises[0] ?? {})).toBe(false);
      expect('mystery' in b).toBe(false);
      const w = b.workouts[0];
      expect('notes' in (w ?? {})).toBe(false);
      expect('templateId' in (w ?? {})).toBe(false);
      expect('restSeconds' in (w?.exercises[0] ?? {})).toBe(false);
      const first = w?.exercises[0]?.sets[0];
      expect('isPR' in (first ?? {})).toBe(false);
      expect('reps' in (first ?? {})).toBe(false);
      expect('note' in (b.bodyweight[0] ?? {})).toBe(false);
      expect('bodyweightGoalKg' in b.settings).toBe(false);
    });

    it('keeps isPR true', () => {
      expect(valid().workouts[0]?.exercises[0]?.sets[1]?.isPR).toBe(true);
    });

    it('fills missing settings fields from the defaults', () => {
      const r = parseOf((d) => {
        remove(d, 'settings.soundEnabled');
        remove(d, 'settings.schemaVersion');
      });
      expect(r.ok && r.backup.settings.soundEnabled).toBe(true);
      expect(r.ok && r.backup.settings.schemaVersion).toBe(1);
    });

    it('turns an empty settings object into the app defaults', () => {
      const r = parseOf((d) => set(d, 'settings', {}));
      expect(r.ok && r.backup.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('clamps the rest default like sanitizeSettings', () => {
      const r = parseOf((d) => set(d, 'settings.defaultRestSeconds', 5000));
      expect(r.ok && r.backup.settings.defaultRestSeconds).toBe(600);
    });
  });
});

describe('summarizeBackup', () => {
  it('counts rows and flags other accounts', () => {
    const b = valid();
    expect(summarizeBackup(b, OWNER)).toEqual({
      exercises: 2,
      customExercises: 1,
      workouts: 1,
      templates: 1,
      bodyweight: 1,
      exportedAt: '2026-11-15T12:00:00.000Z',
      fromOtherAccount: false,
    });
    expect(summarizeBackup(b, OTHER).fromOtherAccount).toBe(true);
  });
});

describe('remapForUser', () => {
  it('is the identity for the same user', () => {
    const b = valid();
    expect(remapForUser(b, OWNER)).toBe(b);
  });

  it('is deterministic and does not mutate the input', () => {
    const b = valid();
    const snapshot = structuredClone(b);
    const first = remapForUser(b, OTHER);
    expect(remapForUser(b, OTHER)).toEqual(first);
    expect(b).toEqual(snapshot);
  });

  it('rewrites ids and references for another user', () => {
    const out = remapForUser(valid(), OTHER);
    const ns = userNamespace(OTHER);
    expect(out.userId).toBe(OTHER);

    const [seeded, custom] = out.exercises;
    expect(seeded?.id).toBe(seededExerciseId(OTHER, 'Bench Press'));
    expect(custom?.id).toBe(v5(FLY, ns));
    expect(out.exercises.every((e) => e.userId === OTHER)).toBe(true);

    const w = out.workouts[0];
    expect(w?.id).toBe(v5(WORKOUT, ns));
    expect(w?.userId).toBe(OTHER);
    expect(w?.exercises[0]?.exerciseId).toBe(seeded?.id);
    expect(w?.exercises[0]?.id).toBe('we-1');
    expect(w?.exercises[0]?.sets.map((s) => s.id)).toEqual(['s-1', 's-2']);
    expect(w?.exercises[0]?.sets[1]?.isPR).toBe(true);

    const t = out.templates[0];
    expect(t?.id).toBe(v5(TEMPLATE, ns));
    expect(w?.templateId).toBe(t?.id);
    expect(t?.exercises[0]?.exerciseId).toBe(seeded?.id);

    expect(out.bodyweight[0]?.id).toBe(bodyweightId(OTHER, '2026-11-14'));
    expect(out.bodyweight[0]?.userId).toBe(OTHER);
  });

  it('keeps ids unique when two seeded exercises share a name key', () => {
    const b = valid();
    const first = b.exercises[0];
    if (!first) throw new Error('fixture');
    b.exercises.push({ ...first, id: 'aaaaaaaa-0000-4000-8000-000000000009', archived: true });
    const ids = remapForUser(b, OTHER).exercises.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('produces a backup that still validates', () => {
    expect(parseBackup(JSON.stringify(remapForUser(valid(), OTHER))).ok).toBe(true);
  });
});

describe('backupFileName', () => {
  it('uses the local date', () => {
    expect(backupFileName(new Date(2026, 10, 5, 23, 59).getTime())).toBe(
      'lift-backup-2026-11-05.json',
    );
  });
});
