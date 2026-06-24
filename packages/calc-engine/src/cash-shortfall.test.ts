/**
 * cash-shortfall.test.ts — 자금부족 대응: 부족분 vs 차입여력(당좌·마이너스 한도).
 * 코드는 부족 금액·한도여력·순부족을 산출, '어떻게 메울지'(권장 조치)는 AI.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runCalcEngine } from './engine.js';
import { metricId } from './ids.js';
import { CalcEngineInput, DatasetKind } from './types.js';

const base: Omit<CalcEngineInput, 'datasets'> = {
  tenantId: 't_sf',
  domain: 'cash',
  period: '2026-06-24',
  inputsHash: 'sha256:test',
  generatedAt: '2026-06-24T00:00:00.000Z',
};
const M = (name: string) => metricId('cash', '2026-06-24', name);

/** 기초 1억, 당좌한도 H, 6/29 확정지급 1.5억 → 예측 최저 -5천만, 부족분 5천만. */
function scenario(overdraftLimit: string) {
  return runCalcEngine({
    ...base,
    datasets: [
      { kind: DatasetKind.BANK_ACCOUNT_MASTER, rows: [{ id: 'm1', data: { accountAlias: '운영', openingBalance: '100000000', overdraftLimit } }] },
      { kind: DatasetKind.CASHFLOW_SCHEDULE, rows: [{ id: 's1', data: { scheduledDate: '2026-06-29', direction: '지급', certainty: '확정', amount: '150000000' } }] },
    ],
  });
}

test('한도로도 못 메우는 순부족 → 위험(FATAL) 플래그', () => {
  const cro = scenario('30000000'); // 당좌한도 3천만
  const v = (n: string) => cro.metrics.find((m) => m.id === M(n))?.value;
  assert.equal(v('credit.headroom'), '30000000', '차입여력=당좌한도');
  assert.equal(v('shortfall.amount'), '50000000', '안전선 대비 부족분');
  assert.equal(v('shortfall.after_credit'), '20000000', '한도 차감 후 순부족(5천만-3천만)');
  const flag = cro.flags.find((f) => f.type === 'shortfall_exceeds_credit');
  assert.ok(flag, '순부족>0 → 위험 플래그');
  assert.equal(flag?.severity, 'FATAL');
});

test('당좌한도로 커버되면 순부족 0, 위험 플래그 없음(안전선 하회 WARN만)', () => {
  const cro = scenario('60000000'); // 당좌한도 6천만 ≥ 부족분 5천만
  const v = (n: string) => cro.metrics.find((m) => m.id === M(n))?.value;
  assert.equal(v('shortfall.after_credit'), '0', '한도로 커버 → 순부족 0');
  assert.equal(cro.flags.filter((f) => f.type === 'shortfall_exceeds_credit').length, 0);
  // 안전선 하회 WARN은 여전히 발화
  assert.ok(cro.flags.some((f) => f.type === 'min_balance_below_threshold'));
});
