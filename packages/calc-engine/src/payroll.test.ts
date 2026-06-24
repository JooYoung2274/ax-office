/**
 * payroll.test.ts — 급여·4대보험 도메인: 직원별 4대보험 공제·실수령액 + 검증.
 * 코드가 결정론적으로 계산하는 영역(이상징후 '해석'은 AI).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runCalcEngine } from './engine.js';
import { metricId, flagId } from './ids.js';
import { CalcEngineInput, DatasetKind } from './types.js';

const base: Omit<CalcEngineInput, 'datasets'> = {
  tenantId: 't_payroll',
  domain: 'payroll',
  period: '2026-06',
  inputsHash: 'sha256:test',
  generatedAt: '2026-06-25T00:00:00.000Z',
};
const M = (name: string) => metricId('payroll', '2026-06', name);

test('직원별 4대보험 공제·실수령액 결정론 계산', () => {
  // 기본급 300만 + 과세수당 20만 + 식대 15만(비과세) / 소득세 84,850 + 지방세 8,480
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.PAYROLL_REGISTER,
        rows: [
          {
            id: 'r1',
            data: {
              empId: 'E001',
              name: '김직원',
              dept: '재무팀',
              baseSalary: '3000000',
              taxableAllowance: '200000',
              mealAllowance: '150000',
              incomeTax: '84850',
              localTax: '8480',
            },
          },
        ],
      },
    ],
  });

  const v = (name: string) => cro.metrics.find((m) => m.id === M(name))?.value;
  assert.equal(v('emp.gross.E001'), '3350000', '총지급');
  assert.equal(v('emp.taxable.E001'), '3200000', '과세소득(식대 비과세 제외)');
  assert.equal(v('emp.deduction.pension.E001'), '144000', '국민연금 3.2M×4.5%');
  assert.equal(v('emp.deduction.health.E001'), '113440', '건강보험 3.2M×3.545%');
  assert.equal(v('emp.deduction.ltcare.E001'), '14690', '장기요양 건보료×12.95%');
  assert.equal(v('emp.deduction.employment.E001'), '28800', '고용보험 3.2M×0.9%');
  assert.equal(v('emp.deduction.total.E001'), '394260', '공제합 = 4대보험 300,930 + 소득세 84,850 + 지방세 8,480');
  assert.equal(v('emp.netpay.E001'), '2955740', '실수령 = 3,350,000 − 394,260');

  // 집계
  assert.equal(v('payroll.headcount'), '1');
  assert.equal(v('payroll.gross.total'), '3350000');
  assert.equal(v('payroll.netpay.total'), '2955740');
  assert.equal(cro.validationSummary.blockedAI, false);
});

test('식대 비과세 한도(20만) 초과 → 경고 플래그', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.PAYROLL_REGISTER,
        rows: [
          {
            id: 'r1',
            data: { empId: 'E002', name: '이초과', baseSalary: '3000000', mealAllowance: '250000', incomeTax: '80000', localTax: '8000' },
          },
        ],
      },
    ],
  });
  // 식대 25만 중 5만 초과분이 과세소득에 산입 → 과세소득 = 300만 + 5만 = 305만
  const v = (name: string) => cro.metrics.find((m) => m.id === M(name))?.value;
  assert.equal(v('emp.taxable.E002'), '3050000');
  const flag = cro.flags.find((f) => f.id === flagId('payroll', '2026-06', 'meal_allowance_over_limit'));
  assert.ok(flag, '식대 한도 초과 플래그 발화');
  assert.equal(flag?.severity, 'WARN');
});

test('전월 대비 총지급 급변동(±임계 초과) → 경고 플래그', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.PAYROLL_REGISTER,
        rows: [
          // E010: 전월 200만 → 당월 340만(+70%) → 급변동 플래그
          { id: 'r1', data: { empId: 'E010', name: '급증', baseSalary: '3400000', prevGross: '2000000', incomeTax: '90000', localTax: '9000' } },
          // E011: 전월 290만 → 당월 300만(+3.4%) → 정상(플래그 없음)
          { id: 'r2', data: { empId: 'E011', name: '정상', baseSalary: '3000000', prevGross: '2900000', incomeTax: '80000', localTax: '8000' } },
        ],
      },
    ],
  });
  const flag = cro.flags.find((f) => f.id === flagId('payroll', '2026-06', 'payroll_mom_change'));
  assert.ok(flag, '급변동 플래그 1건 발화(E010만)');
  assert.equal(flag?.severity, 'WARN');
  assert.equal(flag?.accountId, 'E010');
  // E011은 플래그 없음
  assert.equal(cro.flags.filter((f) => f.type === 'payroll_mom_change').length, 1);
});

test('실수령액 음수 → FATAL(AI 차단)', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.PAYROLL_REGISTER,
        rows: [
          // 공제가 지급을 초과(소득세 과다 입력)
          { id: 'r1', data: { empId: 'E003', name: '오류', baseSalary: '2000000', incomeTax: '2500000', localTax: '250000' } },
        ],
      },
    ],
  });
  assert.equal(cro.validationSummary.blockedAI, true, 'FATAL이면 AI 차단');
  assert.ok(cro.validationSummary.issues.some((i) => i.severity === 'FATAL'));
});
