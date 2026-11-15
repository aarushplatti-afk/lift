export const RETRY_DELAYS_MS: readonly number[] = [2000, 5000, 15000, 60000, 120000, 300000];

export class SyncRequestError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'SyncRequestError';
    this.status = status;
    this.code = code;
  }
}

const PERMANENT_STATUSES = new Set([400, 403, 409, 413, 422]);
const RETRYABLE_STATUSES = new Set([401, 408, 429]);
const SCHEMA_PENDING_CODES = new Set(['PGRST204', 'PGRST205']);
const AUTH_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);

function readStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function readCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function readMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

export function isAuthError(err: unknown): boolean {
  if (readStatus(err) === 401) return true;
  const code = readCode(err);
  if (code !== undefined && AUTH_CODES.has(code)) return true;
  return /jwt expired/i.test(readMessage(err));
}

export function classifyError(err: unknown, priorAttempts: number): 'retryable' | 'permanent' {
  if (err instanceof TypeError) return 'retryable';
  const code = readCode(err);
  if (code !== undefined) {
    if (SCHEMA_PENDING_CODES.has(code)) return 'retryable';
    if (code === '23505') return priorAttempts === 0 ? 'retryable' : 'permanent';
    if (code === '42501' || /^2[23]/.test(code)) return 'permanent';
  }
  const status = readStatus(err);
  if (status !== undefined) {
    if (RETRYABLE_STATUSES.has(status) || status >= 500) return 'retryable';
    if (PERMANENT_STATUSES.has(status)) return 'permanent';
  }
  return 'retryable';
}

export function nextDelay(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[index] ?? 300000;
}

export function describeSyncError(err: unknown): string {
  const code = readCode(err);
  if (code === '23505') return 'Duplicate name';
  if (code === '42501') return 'Not allowed by the server';
  if (code !== undefined && (/^22/.test(code) || code === '23514')) return 'Value out of range';
  return readMessage(err) || 'Unknown sync error';
}
