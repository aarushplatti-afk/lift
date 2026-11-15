import { listFailedChanges, type FailedChange } from '../db/repos/outbox';
import { useLiveQuery } from './useLiveQuery';

const NONE: FailedChange[] = [];

export function useFailedChanges(): FailedChange[] {
  return useLiveQuery(listFailedChanges, [], NONE);
}
