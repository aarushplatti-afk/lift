export type InvalidField = 'weight' | 'reps' | 'duration';
export type CompleteResult = { ok: true; completed: boolean } | { ok: false; field: InvalidField };
