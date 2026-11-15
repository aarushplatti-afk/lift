import { BW_MAX_KG } from '../../../lib/calc/bodyweight';
import type { BodyweightWeightError } from '../../../lib/calc/bodyweight';
import { formatWeight } from '../../../lib/format';
import type { Unit } from '../../../types/domain';

export function weightErrorMessage(
  error: BodyweightWeightError | undefined,
  unit: Unit,
): string | undefined {
  if (error === 'too_low') return 'Enter a weight above 0';
  if (error === 'too_high') {
    return `Weight must be under ${formatWeight(BW_MAX_KG, unit, { withUnit: true })}`;
  }
  return undefined;
}
