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
  /** 소득세 미입력 여부(실수령 정확도 제한 표시용). */
  incomeTaxMissing: boolean;
  localTax: Decimal;
  deductionTotal: Decimal;
  netpay: Decimal;
  /** 회사부담 4대보험(국민연금·건강·장기요양·고용·산재). */
  employerPension: Decimal;
  employerHealth: Decimal;
  employerLtcare: Decimal;
  employerEmployment: Decimal;
  employerAccident: Decimal;
  employerTotal: Decimal;
  /** 총 인건비 = 총지급 + 회사부담. */
  laborCost: Decimal;
  /** 전월 총지급액(입력, 급변동 비교용). 미입력 시 0. */
  prevGross: Decimal;
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

  // 식대 비과세 한도 초과분만 과세소득에 산입.
  const mealLimit = dec(t.mealTaxFreeLimit);
  const mealTaxable = max([sub(mealAllowance, mealLimit), 0]) ?? dec(0);

  const gross = add(add(baseSalary, taxableAllowance), mealAllowance);
  const taxable = add(add(baseSalary, taxableAllowance), mealTaxable);

  // 4대보험(근로자 부담) — 기준소득월액 상·하한 적용 후 원단위 반올림.
  const pensionBase = max([min([taxable, dec(t.pensionMaxBase)]) ?? taxable, dec(t.pensionMinBase)]) ?? taxable;
  const pension = won(mul(pensionBase, t.pensionRate));
  const healthBase = min([taxable, dec(t.healthMaxBase)]) ?? taxable;
  const health = won(mul(healthBase, t.healthRate));
  const ltcare = won(mul(health, t.ltcareRate));
  const employment = won(mul(taxable, t.employmentRate));
  const insuranceTotal = sum([pension, health, ltcare, employment]);

  // 소득세: 회사 확정값(홈택스 간이세액표 조회/급여SW) 입력 사용. 미입력 시 0 + 미입력 표시.
  // (표준 산식 추정은 간이세액표보다 과대해 신뢰 불가 → 정확값 입력을 원칙으로.)
  const incomeTaxMissing = str(row, 'incomeTax') === '';
  const incomeTax = numOr0(row, 'incomeTax');
  // 지방소득세 미입력 시 소득세의 10%.
  const localTax = str(row, 'localTax') !== '' ? numOr0(row, 'localTax') : won(mul(incomeTax, '0.1'));

  const deductionTotal = sum([insuranceTotal, incomeTax, localTax]);
  const netpay = sub(gross, deductionTotal);

  // 회사부담 4대보험(국민연금·건강·장기요양은 근로자와 동일 요율, 고용·산재는 별도).
  const employerPension = pension;
  const employerHealth = health;
  const employerLtcare = ltcare;
  const employerEmployment = won(mul(taxable, t.employerEmploymentRate));
  const employerAccident = won(mul(taxable, t.accidentRate));
  const employerTotal = sum([employerPension, employerHealth, employerLtcare, employerEmployment, employerAccident]);
  const laborCost = add(gross, employerTotal);

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
    incomeTaxMissing,
    localTax,
    deductionTotal,
    netpay,
    employerPension,
    employerHealth,
    employerLtcare,
    employerEmployment,
    employerAccident,
    employerTotal,
    laborCost,
    prevGross: numOr0(row, 'prevGross'),
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
  perEmp('emp.income_tax', '소득세(지방세 포함)', (e) => add(e.incomeTax, e.localTax), '소득세 + 지방소득세'),
  perEmp('emp.netpay', '실수령액', (e) => e.netpay, '총지급 − 공제합계'),
  perEmp('emp.employer.total', '회사부담 4대보험', (e) => e.employerTotal, '국민연금+건강+장기요양+고용+산재(회사분)'),
  perEmp('emp.labor_cost', '총 인건비', (e) => e.laborCost, '총지급 + 회사부담'),
  aggregate('payroll.headcount', '인원수', (emps) => dec(emps.length), 'COUNT'),
  aggregate('payroll.gross.total', '총지급액 합계', (emps) => sum(emps.map((e) => e.gross))),
  aggregate('payroll.taxable.total', '과세소득 합계', (emps) => sum(emps.map((e) => e.taxable))),
  aggregate('payroll.insurance.total', '4대보험 합계(근로자)', (emps) => sum(emps.map((e) => e.insuranceTotal))),
  aggregate('payroll.income_tax.total', '소득세+지방세 합계', (emps) => sum(emps.flatMap((e) => [e.incomeTax, e.localTax]))),
  aggregate('payroll.deduction.total', '총 공제 합계', (emps) => sum(emps.map((e) => e.deductionTotal))),
  aggregate('payroll.netpay.total', '총 실지급액', (emps) => sum(emps.map((e) => e.netpay))),
  aggregate('payroll.employer.total', '회사부담 4대보험 합계', (emps) => sum(emps.map((e) => e.employerTotal))),
  aggregate('payroll.labor_cost.total', '총 인건비 합계', (emps) => sum(emps.map((e) => e.laborCost))),
];
