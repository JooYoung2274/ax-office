/**
 * metrics/payroll-flags.ts — 급여 도메인 Flag(코드는 '사실'만, 해석은 AI).
 * 식대 비과세 한도 초과 / 공제율 비정상. value·expected는 그대로 인용된다.
 */
import { abs, div, gt, moneyString, mul, ratioString, sub } from '../decimal.js';
import { Flag } from '@axaxax/shared';
import { FlagDef } from '../registry.js';
import { allEmps } from './payroll.js';

/** flag.meal_allowance_over_limit — 식대 비과세 한도 초과분이 과세소득에 산입됨. */
export const mealOverLimit: FlagDef = {
  name: 'meal_allowance_over_limit',
  type: 'meal_allowance_over_limit',
  compute(ctx) {
    const out: Omit<Flag, 'id'>[] = [];
    for (const e of allEmps(ctx)) {
      if (gt(e.mealTaxable, 0)) {
        out.push({
          type: 'meal_allowance_over_limit',
          severity: 'WARN',
          message: `${e.name || e.empId} 식대 비과세 한도 초과분 ${moneyString(e.mealTaxable)}원이 과세소득에 산입됨`,
          accountId: e.empId,
          value: moneyString(e.mealTaxable),
          expected: ctx.thresholds.mealTaxFreeLimit,
          evidenceCells: [],
          sourceRowIds: [e.rowId],
        });
      }
    }
    return out.length ? out : null;
  },
};

/** flag.high_deduction_rate — 공제율(공제합/총지급)이 임계 초과. */
export const highDeductionRate: FlagDef = {
  name: 'high_deduction_rate',
  type: 'high_deduction_rate',
  compute(ctx) {
    const limitPct = ctx.thresholds.deductionRatePct;
    const out: Omit<Flag, 'id'>[] = [];
    for (const e of allEmps(ctx)) {
      if (!gt(e.gross, 0)) continue;
      const ratio = div(e.deductionTotal, e.gross);
      if (!ratio) continue;
      const pct = mul(ratio, 100);
      if (gt(pct, limitPct)) {
        out.push({
          type: 'high_deduction_rate',
          severity: 'WARN',
          message: `${e.name || e.empId} 공제율 ${ratioString(pct)}%가 임계 ${limitPct}%를 초과`,
          accountId: e.empId,
          value: ratioString(pct),
          expected: String(limitPct),
          evidenceCells: [],
          sourceRowIds: [e.rowId],
        });
      }
    }
    return out.length ? out : null;
  },
};

/** flag.payroll_mom_change — 전월 대비 총지급 급변동(±임계 초과). 전월총지급(prevGross) 입력 필요. */
export const momChange: FlagDef = {
  name: 'payroll_mom_change',
  type: 'payroll_mom_change',
  compute(ctx) {
    const limitPct = ctx.thresholds.momChangePct;
    const out: Omit<Flag, 'id'>[] = [];
    for (const e of allEmps(ctx)) {
      if (!gt(e.prevGross, 0)) continue; // 전월 데이터 없으면 비교 불가
      const changeRate = div(sub(e.gross, e.prevGross), e.prevGross);
      if (!changeRate) continue;
      const pct = mul(changeRate, 100);
      if (gt(abs(pct), limitPct)) {
        const dir = gt(pct, 0) ? '증가' : '감소';
        out.push({
          type: 'payroll_mom_change',
          severity: 'WARN',
          message: `${e.name || e.empId} 총지급액이 전월 ${moneyString(e.prevGross)}원 → 당월 ${moneyString(e.gross)}원으로 ${ratioString(abs(pct))}% ${dir}(임계 ${limitPct}% 초과)`,
          accountId: e.empId,
          value: ratioString(pct),
          expected: String(limitPct),
          evidenceCells: [],
          sourceRowIds: [e.rowId],
        });
      }
    }
    return out.length ? out : null;
  },
};

/** flag.payroll_income_tax_missing — 소득세 미입력(실수령 정확도 제한). */
export const incomeTaxMissingFlag: FlagDef = {
  name: 'payroll_income_tax_missing',
  type: 'payroll_income_tax_missing',
  compute(ctx) {
    const missing = allEmps(ctx).filter((e) => e.incomeTaxMissing);
    if (missing.length === 0) return null;
    return [
      {
        type: 'payroll_income_tax_missing',
        severity: 'WARN',
        message: `소득세가 입력되지 않은 직원 ${missing.length}명 — 홈택스 간이세액표 조회값(또는 급여SW 산출값)을 입력해야 실수령액이 정확합니다`,
        value: String(missing.length),
        expected: '0',
        evidenceCells: [],
        sourceRowIds: missing.map((e) => e.rowId),
      },
    ];
  },
};

export const PAYROLL_FLAGS: FlagDef[] = [mealOverLimit, highDeductionRate, momChange, incomeTaxMissingFlag];
