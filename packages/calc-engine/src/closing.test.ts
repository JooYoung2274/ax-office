/**
 * closing.test.ts — 결산 도메인: 차대 불균형 FATAL 게이트 + metric 정확성.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runCalcEngine } from './engine.js';
import { metricId } from './ids.js';
import { CalcEngineInput, DatasetKind } from './types.js';

function tbRow(id: string, code: string, debit: string, credit: string): {
  id: string;
  data: Record<string, string>;
} {
  return { id, data: { accountCode: code, accountName: code, debitTotal: debit, creditTotal: credit } };
}

const base: Omit<CalcEngineInput, 'datasets'> = {
  tenantId: 't_single_mvp',
  domain: 'closing',
  period: '2026-05',
  inputsHash: 'sha256:test',
  generatedAt: '2026-06-24T00:00:00.000Z',
};

test('차변≠대변이면 FATAL + blockedAI=true', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.TRIAL_BALANCE,
        rows: [tbRow('r1', '0108', '80000000', '50000000'), tbRow('r2', '0251', '50000000', '70000000')],
      },
    ],
  });
  // 차변합 130,000,000 / 대변합 120,000,000 → 불균형.
  assert.equal(cro.validationSummary.blockedAI, true);
  assert.equal(cro.validationSummary.counts.fatal >= 1, true);
  const fatal = cro.validationSummary.issues.find((i) => i.ruleId === 'crit.debitCreditMismatch');
  assert.ok(fatal, 'debitCreditMismatch FATAL이 있어야 함');
  // blocked여도 유효한 CRO + metric은 부분 산출.
  assert.equal(cro.engineVersion, 'calc-engine@0.1.0');
  const check = cro.metrics.find((m) => m.id === metricId('closing', '2026-05', 'tb.balance_check'));
  assert.equal(check?.value, '10000000');
});

test('차변=대변이면 FATAL 0 + blockedAI=false', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.TRIAL_BALANCE,
        rows: [tbRow('r1', '0108', '80000000', '60000000'), tbRow('r2', '0251', '40000000', '60000000')],
      },
    ],
  });
  assert.equal(cro.validationSummary.counts.fatal, 0);
  assert.equal(cro.validationSummary.blockedAI, false);
  const debit = cro.metrics.find((m) => m.id === metricId('closing', '2026-05', 'tb.debit_total'));
  assert.equal(debit?.value, '120000000');
  const balanceCheck = cro.metrics.find(
    (m) => m.id === metricId('closing', '2026-05', 'tb.balance_check'),
  );
  assert.equal(balanceCheck?.value, '0');
});

test('YoY 증감액/증감률 metric', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.TRIAL_BALANCE,
        rows: [tbRow('r1', '0108', '100', '100')],
      },
      {
        kind: DatasetKind.COMPARATIVE_FS,
        rows: [
          {
            id: 'c1',
            data: {
              statement: 'IS',
              lineItem: '매출액',
              currentAmt: '1200000000',
              priorAmt: '1000000000',
              period: '2026-05',
              priorPeriod: '2025-05',
            },
          },
        ],
      },
    ],
  });
  const amount = cro.metrics.find((m) => m.id.endsWith('var.yoy.amount.매출액'));
  const pct = cro.metrics.find((m) => m.id.endsWith('var.yoy.pct.매출액'));
  assert.equal(amount?.value, '200000000');
  assert.equal(pct?.value, '20.00');
  // 이상 variance 플래그 발화(20% < 30% 기본 임계 → 미발화 확인).
  assert.equal(cro.flags.length, 0);
});

test('결정론: 동일 입력 → 동일 출력(generatedAt 제외)', () => {
  const input: CalcEngineInput = {
    ...base,
    datasets: [{ kind: DatasetKind.TRIAL_BALANCE, rows: [tbRow('r1', '0108', '100', '100')] }],
  };
  const a = runCalcEngine(input);
  const b = runCalcEngine(input);
  assert.deepEqual(a.metrics, b.metrics);
  assert.deepEqual(a.flags, b.flags);
  assert.deepEqual(a.validationSummary, b.validationSummary);
});
