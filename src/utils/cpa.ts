import type { CpaInputs } from '../types/campaign';

export type CpaStatus = 'safe' | 'caution' | 'over_limit';

export interface CpaEvaluation {
  breakEvenCpaRm: number;
  maxRecommendedCplRm: number;
  projectedCpaRm: number;
  ratioToBreakEven: number;
  status: CpaStatus;
  hasZeroCloseRate: boolean;
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCpaMetrics(inputs: CpaInputs): CpaEvaluation {
  const price = clampFinite(inputs.servicePriceRm, 0, 1_000_000);
  const margin = clampFinite(inputs.marginPercent, 0, 100);
  const closeRate = clampFinite(inputs.closeRatePercent, 0, 100);
  const cpl = clampFinite(inputs.estimatedCplRm, 0, 1_000_000);

  const breakEvenCpaRm = round2(price * (margin / 100));
  const maxRecommendedCplRm = round2(breakEvenCpaRm * (closeRate / 100));
  const hasZeroCloseRate = closeRate <= 0;
  const projectedCpaRm = hasZeroCloseRate ? 0 : round2(cpl / (closeRate / 100));

  let ratioToBreakEven = 0;
  let status: CpaStatus = 'safe';

  if (breakEvenCpaRm <= 0 || hasZeroCloseRate) {
    ratioToBreakEven = cpl > 0 ? 1.01 : 0;
    status = cpl > 0 ? 'over_limit' : 'caution';
  } else {
    const rawRatio = projectedCpaRm / breakEvenCpaRm;
    ratioToBreakEven = round2(rawRatio);
    if (rawRatio <= 0.75) {
      status = 'safe';
    } else if (rawRatio <= 1.0) {
      status = 'caution';
    } else {
      status = 'over_limit';
    }
  }

  return {
    breakEvenCpaRm,
    maxRecommendedCplRm,
    projectedCpaRm,
    ratioToBreakEven,
    status,
    hasZeroCloseRate,
  };
}

export function formatRm(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `RM ${safe.toFixed(2)}`;
}
