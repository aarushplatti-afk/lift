import type { Unit } from '../types/domain';

export const KG_PER_LB = 0.45359237;

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f + Number.EPSILON * f * Math.sign(value)) / f;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function roundKg(kg: number): number {
  return round(kg, 4);
}

export function toDisplay(kg: number, unit: Unit): number {
  return round(unit === 'lb' ? kgToLb(kg) : kg, 1);
}

export function fromDisplay(value: number, unit: Unit): number {
  return roundKg(unit === 'lb' ? lbToKg(value) : value);
}

export function parseDecimal(raw: string): number | undefined {
  const s = raw.trim();
  if (s === '') return undefined;
  const single = s.indexOf(',') === s.lastIndexOf(',');
  const normalized = !s.includes('.') && single ? s.replace(',', '.') : s;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(normalized)) return undefined;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function fromDisplayInput(raw: string, unit: Unit): number | undefined {
  const n = parseDecimal(raw);
  return n === undefined ? undefined : fromDisplay(n, unit);
}
