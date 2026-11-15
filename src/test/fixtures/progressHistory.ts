import { lbToKg } from '../../lib/units';
import type { Exercise, SetType, Workout, WorkoutExercise, WorkoutSet } from '../../types/domain';

export interface BuildProgressHistoryOptions {
  workoutCount?: number;
  seed?: number;
  startMs?: number;
  dayStep?: number;
}

export interface ProgressHistory {
  exercises: Exercise[];
  workouts: Workout[];
}

type Rand = () => number;

interface SetSpec {
  type: SetType;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
}

interface BlockSpec {
  exerciseId: string;
  specs: SetSpec[];
}

const USER_ID = 'u1';
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DEFAULT_START_MS = Date.UTC(2020, 0, 1, 17, 0);
const INCOMPLETE_RATE = 0.05;
const DROP_RATE = 0.2;
const DUPLICATE_BENCH_EVERY = 50;

const BENCH = 'fx-bench';
const PULLUP = 'fx-pullup';
const PUSHUP = 'fx-pushup';
const PLANK = 'fx-plank';

/** Workout i uses ACCESSORY_ROTATION[i % length] for its non-Bench blocks. */
const ACCESSORY_ROTATION: readonly (readonly string[])[] = [
  [PULLUP, PUSHUP],
  [PUSHUP, PLANK],
  [PLANK, PULLUP],
];

/** mulberry32: small seeded PRNG returning floats in [0, 1). */
function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive. */
function pick(rand: Rand, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function roundTo25(lb: number): number {
  return Math.round(lb / 2.5) * 2.5;
}

function padNumber(i: number): string {
  return String(i).padStart(4, '0');
}

function buildExercises(startMs: number): Exercise[] {
  const base = {
    userId: USER_ID,
    updatedAt: startMs,
    isCustom: false,
    archived: false,
    createdAt: startMs,
  };
  return [
    {
      ...base,
      id: BENCH,
      name: 'Barbell Bench Press',
      muscleGroup: 'chest',
      equipment: 'barbell',
      type: 'weight_reps',
    },
    {
      ...base,
      id: PULLUP,
      name: 'Weighted Pull-Up',
      muscleGroup: 'back',
      equipment: 'bodyweight',
      type: 'weighted_bodyweight',
    },
    {
      ...base,
      id: PUSHUP,
      name: 'Push-Up',
      muscleGroup: 'chest',
      equipment: 'bodyweight',
      type: 'bodyweight_reps',
    },
    {
      ...base,
      id: PLANK,
      name: 'Plank',
      muscleGroup: 'core',
      equipment: 'bodyweight',
      type: 'duration',
    },
  ];
}

function benchSpecs(rand: Rand, targetLb: number): SetSpec[] {
  const specs: SetSpec[] = [
    { type: 'warmup', weightKg: lbToKg(roundTo25(targetLb * 0.5)), reps: 5 },
  ];
  for (let k = 0; k < 3; k++) {
    specs.push({ type: 'normal', weightKg: lbToKg(targetLb), reps: pick(rand, 4, 8) });
  }
  if (rand() < DROP_RATE) {
    specs.push({
      type: 'drop',
      weightKg: lbToKg(roundTo25(targetLb * 0.8)),
      reps: pick(rand, 6, 10),
    });
  }
  return specs;
}

function accessorySpecs(rand: Rand, exerciseId: string): SetSpec[] {
  if (exerciseId === PULLUP) {
    const addedLb = rand() < 0.3 ? 0 : roundTo25(5 + pick(rand, 0, 7) * 2.5);
    const specs: SetSpec[] = Array.from({ length: 3 }, (): SetSpec => ({
      type: 'normal',
      weightKg: lbToKg(addedLb),
      reps: pick(rand, 5, 10),
    }));
    if (rand() < DROP_RATE) {
      specs.push({
        type: 'drop',
        weightKg: lbToKg(roundTo25(addedLb * 0.8)),
        reps: pick(rand, 3, 6),
      });
    }
    return specs;
  }
  if (exerciseId === PUSHUP) {
    const specs: SetSpec[] = Array.from({ length: 3 }, (): SetSpec => ({
      type: 'normal',
      reps: pick(rand, 10, 20),
    }));
    if (rand() < DROP_RATE) {
      specs.push({ type: 'drop', reps: pick(rand, 5, 9) });
    }
    return specs;
  }
  return Array.from({ length: 3 }, (): SetSpec => ({
    type: 'normal',
    durationSec: 30 + pick(rand, 0, 4) * 10,
  }));
}

function buildBlock(
  rand: Rand,
  workoutNumber: string,
  blockIndex: number,
  block: BlockSpec,
  startedAt: number,
): WorkoutExercise {
  const sets: WorkoutSet[] = block.specs.map((spec, setIndex) => {
    const completed = rand() >= INCOMPLETE_RATE;
    const set: WorkoutSet = {
      id: `fx-s-${workoutNumber}-${blockIndex}-${setIndex}`,
      order: setIndex,
      ...spec,
      completed,
    };
    if (completed) {
      set.completedAt = startedAt + (blockIndex * 5 + setIndex + 1) * 2 * MINUTE_MS;
    }
    return set;
  });
  return {
    id: `fx-we-${workoutNumber}-${blockIndex}`,
    exerciseId: block.exerciseId,
    order: blockIndex,
    sets,
  };
}

function buildWorkout(
  rand: Rand,
  index: number,
  total: number,
  startMs: number,
  dayStep: number,
): Workout {
  const workoutNumber = padNumber(index + 1);
  const startedAt = startMs + index * dayStep * DAY_MS;
  const inProgress = index === total - 1;
  const targetLb = roundTo25(135 + index * 0.1 + (rand() - 0.5) * 20);

  const blocks: BlockSpec[] = [{ exerciseId: BENCH, specs: benchSpecs(rand, targetLb) }];
  if ((index + 1) % DUPLICATE_BENCH_EVERY === 0) {
    blocks.push({ exerciseId: BENCH, specs: benchSpecs(rand, targetLb) });
  }
  for (const exerciseId of ACCESSORY_ROTATION[index % ACCESSORY_ROTATION.length] ?? []) {
    blocks.push({ exerciseId, specs: accessorySpecs(rand, exerciseId) });
  }

  const exercises = blocks.map((block, blockIndex) =>
    buildBlock(rand, workoutNumber, blockIndex, block, startedAt),
  );

  const workout: Workout = {
    id: `fx-w-${workoutNumber}`,
    name: `Session ${index + 1}`,
    startedAt,
    status: inProgress ? 'in_progress' : 'completed',
    exercises,
    createdAt: startedAt,
    userId: USER_ID,
    updatedAt: startedAt,
  };
  if (!inProgress) {
    workout.endedAt = startedAt + HOUR_MS + pick(rand, 0, 14) * MINUTE_MS;
  }
  return workout;
}

/**
 * Deterministic progress-history fixture. Produces `workoutCount` completed workouts
 * plus one trailing in-progress workout (total `workoutCount + 1`).
 */
export function buildProgressHistory(opts: BuildProgressHistoryOptions = {}): ProgressHistory {
  const workoutCount = opts.workoutCount ?? 500;
  const seed = opts.seed ?? 1;
  const startMs = opts.startMs ?? DEFAULT_START_MS;
  const dayStep = opts.dayStep ?? 1;

  const rand = mulberry32(seed);
  const total = workoutCount + 1;
  const workouts: Workout[] = [];
  for (let index = 0; index < total; index++) {
    workouts.push(buildWorkout(rand, index, total, startMs, dayStep));
  }
  return { exercises: buildExercises(startMs), workouts };
}
