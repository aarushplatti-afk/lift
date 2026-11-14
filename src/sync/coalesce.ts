import type { OutboxEntry, SyncRecordMap, SyncTable } from '../types/sync';

export type PushOp = {
  table: SyncTable;
  recordId: string;
  entryIds: number[];
  seq: number;
} & ({ op: 'upsert'; payload: SyncRecordMap[SyncTable] } | { op: 'delete'; payload: null });

export function coalesce(entries: OutboxEntry[]): PushOp[] {
  const groups = new Map<string, { entry: OutboxEntry; id: number }[]>();
  for (const entry of entries) {
    if (entry.id === undefined) continue;
    const key = `${entry.table}:${entry.recordId}`;
    const list = groups.get(key) ?? [];
    list.push({ entry, id: entry.id });
    groups.set(key, list);
  }
  const ops: PushOp[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.id - b.id);
    const last = list[list.length - 1];
    if (!last) continue;
    const base = {
      table: last.entry.table,
      recordId: last.entry.recordId,
      entryIds: list.map((x) => x.id),
      seq: last.id,
    };
    ops.push(
      last.entry.op === 'upsert'
        ? { ...base, op: 'upsert', payload: last.entry.payload }
        : { ...base, op: 'delete', payload: null },
    );
  }
  return ops.sort((a, b) => a.seq - b.seq);
}

export function batchRuns(ops: PushOp[], max = 100): PushOp[][] {
  const runs: PushOp[][] = [];
  for (const op of ops) {
    const run = runs[runs.length - 1];
    const head = run?.[0];
    if (run && head && head.table === op.table && head.op === op.op && run.length < max) {
      run.push(op);
    } else {
      runs.push([op]);
    }
  }
  return runs;
}
