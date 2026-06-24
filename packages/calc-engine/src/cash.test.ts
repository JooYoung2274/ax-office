/**
 * cash.test.ts — 자금 도메인: 현금흐름 예측 metric + 유동성 경보 Flag.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runCalcEngine } from './engine.js';
import { flagId, metricId } from './ids.js';
import { CalcEngineInput, DatasetKind } from './types.js';

const base: Omit<CalcEngineInput, 'datasets'> = {
  tenantId: 't_single_mvp',
  domain: 'cash',
  period: '2026-06-24',
  inputsHash: 'sha256:test',
  generatedAt: '2026-06-24T00:00:00.000Z',
};

test('은행별/총 잔액 집계 + 일일 순수지', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.BANK_ACCOUNT_MASTER,
        rows: [{ id: 'm1', data: { accountAlias: '운영_국민', openingBalance: '1000000000' } }],
      },
      {
        kind: DatasetKind.BANK_TRANSACTIONS,
        rows: [
          {
            id: 't1',
            data: { txnDate: '2026-06-24', accountAlias: '운영_국민', depositAmt: '500000000', withdrawalAmt: '0' },
          },
          {
            id: 't2',
            data: { txnDate: '2026-06-24', accountAlias: '운영_국민', depositAmt: '0', withdrawalAmt: '200000000' },
          },
        ],
      },
    ],
  });
  // 기초 10억 + 입금 5억 − 출금 2억 = 13억.
  const total = cro.metrics.find((m) => m.id === metricId('cash', '2026-06-24', 'bank_balance.total'));
  assert.equal(total?.value, '1300000000');
  const dn = cro.metrics.find((m) => m.id === metricId('cash', '2026-06-24', 'daily_net.2026-06-24'));
  assert.equal(dn?.value, '300000000');
});

test('N일 확정 현금흐름 예측 + 최저잔액', () => {
  const cro = runCalcEngine({
    ...base,
    thresholds: { forecastDays: 30 },
    datasets: [
      {
        kind: DatasetKind.BANK_ACCOUNT_MASTER,
        rows: [{ id: 'm1', data: { accountAlias: '운영', openingBalance: '500000000' } }],
      },
      {
        kind: DatasetKind.BANK_TRANSACTIONS,
        rows: [
          { id: 't1', data: { txnDate: '2026-06-24', accountAlias: '운영', depositAmt: '0', withdrawalAmt: '0' } },
        ],
      },
      {
        kind: DatasetKind.CASHFLOW_SCHEDULE,
        rows: [
          // 확정 지급: 7/15 8억 → 잔액 -3억(최저).
          {
            id: 's1',
            data: { scheduledDate: '2026-07-15', direction: '지급', certainty: '확정', amount: '800000000' },
          },
          // 미확정 수금은 예측에서 제외돼야 함.
          {
            id: 's2',
            data: { scheduledDate: '2026-07-10', direction: '수금', certainty: '예상', amount: '900000000' },
          },
        ],
      },
    ],
  });
  const minBal = cro.metrics.find((m) => m.id === metricId('cash', '2026-06-24', 'forecast.min_balance'));
  // 시작잔액 5억, 7/15 확정지급 8억 → -3억. 예상수금은 미포함.
  assert.equal(minBal?.value, '-300000000');

  // 유동성 경보 Flag(안전선 기본 0원 미만).
  const flag = cro.flags.find(
    (f) => f.id === flagId('cash', '2026-06-24', 'min_balance_below_threshold'),
  );
  assert.ok(flag, 'min_balance_below_threshold flag가 발화해야 함');
  assert.equal(flag?.type, 'min_balance_below_threshold');
  assert.equal(flag?.value, '-300000000');
  assert.equal(flag?.severity, 'WARN');
});

test('안전선 위면 경보 미발화', () => {
  const cro = runCalcEngine({
    ...base,
    thresholds: { liquiditySafetyBalance: '0', forecastDays: 10 },
    datasets: [
      {
        kind: DatasetKind.BANK_ACCOUNT_MASTER,
        rows: [{ id: 'm1', data: { accountAlias: '운영', openingBalance: '500000000' } }],
      },
      {
        kind: DatasetKind.BANK_TRANSACTIONS,
        rows: [{ id: 't1', data: { txnDate: '2026-06-24', accountAlias: '운영', depositAmt: '0', withdrawalAmt: '0' } }],
      },
    ],
  });
  assert.equal(cro.flags.length, 0);
});
