/**
 * metrics/payroll.ts — 급여·4대보험 metric(PRD 인사 P0, 슬라이스 C).
 *
 * 직원별 과세소득·4대보험 공제·실수령액과 집계를 결정론적으로 산출.
 * 코드는 "수치"만 만든다 — 급변동/이상 해석은 AI(payroll-flags의 플래그 + 리포트).
 *
 * 요율은 thresholds(2024 기준 기본값, tenant 오버라이드 가능).
 * 소득세(incomeTax)는 간이세액표 산출값을 입력으로 받아 신뢰(지방소득세 미입력 시 소득세×10%).
 */
import { add, dec, Decimal, max, min, moneyString, mul, sub, sum } from '../decimal.js';
import { numOr0, str } from '../parse.js';
import { MetricDef, MetricResult } from '../registry.js';
import { CalcContext, DatasetKind, RawRow } from '../types.js';

/** 직원 1인 급여 계산 결과(원단위 반올림 Decimal). */
export interface EmpPay {
  empId: string;
  name: string;
  dept: string;
  rowId: string;
  gross: Decimal;
  taxable: Decimal;
  mealTaxable: Decimal;
  pension: Decimal;
  health: Decimal;
  ltcare: Decimal;
  employment: Decimal;
  insuranceTotal: Decimal;
  incomeTax: Decimal;
  localTax: Decimal;
  deductionTotal: Decimal;
  netpay: Decimal;
}

/** 원단위 반올림(ROUND_HALF_UP). */
function won(v: Decimal): Decimal {
  return dec(moneyString(v));
}

/** payroll_register 행 → 직원 급여 계산(결정론). */
export function computeEmp(ctx: CalcContext, row: RawRow): EmpPay {
  const t = ctx.thresholds;
  const baseSalary = numOr0(row, 'baseSalary');
  const taxableAllowance = numOr0(row, 'taxableAllowance');
  const mealAllowance = numOr0(row, 'mealAllowance');
  const incomeTax = numOr0(row, 'incomeTax');
  // 지방소득세 미입력 시 소득세의 10%.
  const localTax = str(row, 'localTax') !== '' ? numOr0(row, 'localTax') : won(mul(incomeTax, '0.1'));

  // 식대 비과세 한도 초과분만 과세소득에 산입.
  const mealLimit = dec(t.mealTaxFreeLimit);
  const mealTaxable = max([sub(mealAllowance, mealLimit), 0]) ?? dec(0);

  const gross = add(add(baseSalary, taxableAllowance), mealAllowance);
  const taxable = add(add(baseSalary, taxableAllowance), mealTaxable);

  // 4대보험(근로자 부담) — 각 항목 원단위 반올림 후 합산.
  const pensionBase = min([taxable, dec(t.pensionMaxBase)])!;
  const pension = won(mul(pensionBase, t.pensionRate));
  const health = won(mul(taxable, t.healthRate));
  const ltcare = won(mul(health, t.ltcareRate));
  const employment = won(mul(taxable, t.employmentRate));
  const insuranceTotal = sum([pension, health, ltcare, employment]);

  const deductionTotal = sum([insuranceTotal, incomeTax, localTax]);
  const netpay = sub(gross, deductionTotal);

  return {
    empId: str(row, 'empId') || row.id,
    name: str(row, 'name'),
    dept: str(row, 'dept'),
    rowId: row.id,
    gross,
    taxable,
    mealTaxable,
    pension,
    health,
    ltcare,
    employment,
    insuranceTotal,
    incomeTax,
    localTax,
    deductionTotal,
    netpay,
  };
}

/** 전 직원 계산(행 순서 유지). */
export function allEmps(ctx: CalcContext): EmpPay[] {
  return ctx.rows(DatasetKind.PAYROLL_REGISTER).map((r) => computeEmp(ctx, r));
}

/** metricId-안전 슬러그. 한글/영숫자 보존, 그 외 치환. */
function slug(s: string): string {
  return (s || '').replace(/\s+/g, '_').replace(/[^0-9A-Za-z가-힣_.-]/g, '') || 'X';
}

/** 직원별 단일 필드를 다중 metric으로 전개하는 헬퍼. */
function perEmp(
  name: string,
  label: string,
  pick: (e: EmpPay) => Decimal,
  formula: string,
): MetricDef {
  return {
    name,
    label,
    unit: 'KRW',
    compute(ctx) {
      return allEmps(ctx).map((e): MetricResult => ({
        nameOverride: `${name}.${slug(e.empId)}`,
        value: moneyString(pick(e)),
        unit: 'KRW',
        formula,
        sourceRowIds: [e.rowId],
      }));
    },
  };
}

/** 집계 metric 헬퍼. */
function aggregate(
  name: string,
  label: string,
  reduce: (emps: EmpPay[]) => Decimal,
  unit: MetricDef['unit'] = 'KRW',
  formula?: string,
): MetricDef {
  return {
    name,
    label,
    unit,
    compute(ctx) {
      const emps = allEmps(ctx);
      return {
        value: unit === 'COUNT' ? String(reduce(emps)) : moneyString(reduce(emps)),
        unit,
        formula,
        sourceRowIds: emps.map((e) => e.rowId),
      };
    },
  };
}

/** 급여 도메인 metric 집합(등록 순서 = 계산 순서). */
export const PAYROLL_METRICS: MetricDef[] = [
  perEmp('emp.gross', '총지급액', (e) => e.gross, '기본급 + 과세수당 + 식대'),
  perEmp('emp.taxable', '과세소득', (e) => e.taxable, '기본급 + 과세수당 + 식대초과분'),
  perEmp('emp.deduction.pension', '국민연금', (e) => e.pension, 'min(과세,상한)×요율'),
  perEmp('emp.deduction.health', '건강보험', (e) => e.health, '과세×요율'),
  perEmp('emp.deduction.ltcare', '장기요양', (e) => e.ltcare, '건강보험료×요율'),
  perEmp('emp.deduction.employment', '고용보험', (e) => e.employment, '과세×요율'),
  perEmp('emp.deduction.insurance_total', '4대보험 합계', (e) => e.insuranceTotal, 'Σ4대보험'),
  perEmp('emp.deduction.total', '공제 합계', (e) => e.deductionTotal, '4대보험 + 소득세 + 지방소득세'),
  perEmp('emp.netpay', '실수령액', (e) => e.netpay, '총지급 − 공제합계'),
  aggregate('payroll.headcount', '인원수', (emps) => dec(emps.length), 'COUNT'),
  aggregate('payroll.gross.total', '총지급액 합계', (emps) => sum(emps.map((e) => e.gross))),
  aggregate('payroll.taxable.total', '과세소득 합계', (emps) => sum(emps.map((e) => e.taxable))),
  aggregate('payroll.insurance.total', '4대보험 합계(근로자)', (emps) => sum(emps.map((e) => e.insuranceTotal))),
  aggregate('payroll.income_tax.total', '소득세+지방세 합계', (emps) => sum(emps.flatMap((e) => [e.incomeTax, e.localTax]))),
  aggregate('payroll.deduction.total', '총 공제 합계', (emps) => sum(emps.map((e) => e.deductionTotal))),
  aggregate('payroll.netpay.total', '총 실지급액', (emps) => sum(emps.map((e) => e.netpay))),
];
