import { describe, expect, it } from 'vitest';
import type { OutboxEntry } from '../../types/sync';
import { batchRuns, coalesce, type PushOp } from '../coalesce';
import { exerciseRecord } from './fakeClient';

function up(id: number, recordId: string, name = 'x'): OutboxEntry {
  return {
    id,
    table: 'exercises',
    recordId,
    createdAt: id,
    attempts: 0,
    state: 'pending',
    nextAttemptAt: 0,
    op: 'upsert',
    payload: exerciseRecord(recordId, { name }),
  };
}

function del(id: number, recordId: string): OutboxEntry {
  return {
    id,
    table: 'exercises',
    recordId,
    createdAt: id,
    attempts: 0,
    state: 'pending',
    nextAttemptAt: 0,
    op: 'delete',
    payload: null,
  };
}

describe('coalesce', () => {
  it('latest upsert per record wins and keeps every entry id', () => {
    const ops = coalesce([up(1, 'a', 'one'), up(2, 'a', 'two')]);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.entryIds).toEqual([1, 2]);
    expect(ops[0]?.seq).toBe(2);
    expect(ops[0]?.payload).toMatchObject({ name: 'two' });
  });

  it('upsert then delete becomes delete', () => {
    const ops = coalesce([up(1, 'a'), del(2, 'a')]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'delete', payload: null, entryIds: [1, 2] });
  });

  it('delete then upsert becomes upsert', () => {
    const ops = coalesce([del(1, 'a'), up(2, 'a')]);
    expect(ops[0]).toMatchObject({ op: 'upsert', entryIds: [1, 2] });
  });

  it('orders by max entry id (FIFO)', () => {
    const ops = coalesce([up(1, 'a'), up(2, 'b'), up(3, 'a'), up(4, 'c')]);
    expect(ops.map((o) => o.recordId)).toEqual(['b', 'a', 'c']);
    expect(ops.map((o) => o.seq)).toEqual([2, 3, 4]);
  });

  it('treats the same record id in different tables separately', () => {
    const other: OutboxEntry = { ...up(2, 'a'), table: 'templates' };
    expect(coalesce([up(1, 'a'), other])).toHaveLength(2);
  });
});

describe('batchRuns', () => {
  const op = (table: PushOp['table'], kind: 'upsert' | 'delete', n: number): PushOp =>
    kind === 'upsert'
      ? {
          table,
          recordId: `r${n}`,
          op: 'upsert',
          payload: exerciseRecord(`r${n}`),
          entryIds: [n],
          seq: n,
        }
      : { table, recordId: `r${n}`, op: 'delete', payload: null, entryIds: [n], seq: n };

  it('batches only consecutive ops with the same table and op', () => {
    const runs = batchRuns([
      op('exercises', 'upsert', 1),
      op('exercises', 'upsert', 2),
      op('exercises', 'delete', 3),
      op('exercises', 'upsert', 4),
      op('templates', 'upsert', 5),
    ]);
    expect(runs.map((r) => r.length)).toEqual([2, 1, 1, 1]);
  });

  it('caps a run at max', () => {
    const ops = Array.from({ length: 250 }, (_, i) => op('exercises', 'upsert', i + 1));
    expect(batchRuns(ops).map((r) => r.length)).toEqual([100, 100, 50]);
    expect(batchRuns(ops, 3)[0]).toHaveLength(3);
  });
});
