/**
 * payroll-employer.test.ts — 회사부담 4대보험·총인건비 + 국민연금 상·하한 + 소득세 미입력.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runCalcEngine } from './engine.js';
import { metricId, flagId } from './ids.js';
import { CalcEngineInput, DatasetKind } from './types.js';

const base: Omit<CalcEngineInput, 'datasets'> = {
  tenantId: 't_emp',
  domain: 'payroll',
  period: '2026-06',
  inputsHash: 'sha256:test',
  generatedAt: '2026-06-25T00:00:00.000Z',
};
const M = (n: string) => metricId('payroll', '2026-06', n);

test('회사부담 4대보험 + 총인건비', () => {
  // 과세소득 320만(기본 300만+과세수당 20만+식대 20만 한도내).
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.PAYROLL_REGISTER,
        rows: [{ id: 'r1', data: { empId: 'E001', name: '김재무', baseSalary: '3000000', taxableAllowance: '200000', mealAllowance: '200000', incomeTax: '84850', localTax: '8480' } }],
      },
    ],
  });
  const v = (n: string) => cro.metrics.find((m) => m.id === M(n))?.value;
  // 회사부담: 연금144,000+건강113,440+장기14,690+고용(320만×1.15%)36,800+산재(320만×1.47%)47,040 = 355,970
  assert.equal(v('emp.employer.total.E001'), '355970', '회사부담 4대보험');
  // 총인건비 = 총지급 3,400,000 + 회사부담 355,970
  assert.equal(v('emp.labor_cost.E001'), '3755970', '총 인건비');
  assert.equal(v('payroll.employer.total'), '355970');
  assert.equal(v('payroll.labor_cost.total'), '3755970');
});

test('국민연금 기준소득월액 상·하한 적용', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.PAYROLL_REGISTER,
        rows: [
          // 과세 20만 < 하한 39만 → 하한 적용: 390,000×4.5% = 17,550
          { id: 'lo', data: { empId: 'LO', baseSalary: '200000', incomeTax: '0' } },
          // 과세 1,000만 > 상한 617만 → 상한 적용: 6,170,000×4.5% = 277,650
          { id: 'hi', data: { empId: 'HI', baseSalary: '10000000', incomeTax: '0' } },
        ],
      },
    ],
  });
  const v = (n: string) => cro.metrics.find((m) => m.id === M(n))?.value;
  assert.equal(v('emp.deduction.pension.LO'), '17550', '하한 적용');
  assert.equal(v('emp.deduction.pension.HI'), '277650', '상한 적용');
});

test('소득세 미입력 → 경고 플래그', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.PAYROLL_REGISTER,
        rows: [{ id: 'r1', data: { empId: 'E001', baseSalary: '3000000' } }], // 소득세 미입력
      },
    ],
  });
  const flag = cro.flags.find((f) => f.id === flagId('payroll', '2026-06', 'payroll_income_tax_missing'));
  assert.ok(flag, '소득세 미입력 플래그');
  assert.equal(flag?.severity, 'WARN');
});
