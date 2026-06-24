/**
 * cash-ar.test.ts — 매출채권 회수(AR aging): 거래처별 미수금 연령분석 + 연체·집중도.
 * 자금일보(cash) 도메인 확장. 코드가 연령구간·연체일수·집중도를 결정론 산출.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runCalcEngine } from './engine.js';
import { metricId } from './ids.js';
import { CalcEngineInput, DatasetKind } from './types.js';

const base: Omit<CalcEngineInput, 'datasets'> = {
  tenantId: 't_ar',
  domain: 'cash',
  period: '2026-06-30', // 기준일(asOf)
  inputsHash: 'sha256:test',
  generatedAt: '2026-06-30T00:00:00.000Z',
};
const M = (name: string) => metricId('cash', '2026-06-30', name);

test('거래처별 미수금 연령분석 + 집중도', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.AR_AGING,
        rows: [
          // 6/10 만기 → 20일 연체(d1_30)
          { id: 'a1', data: { counterparty: '(주)가나', amount: '50000000', dueDate: '2026-06-10' } },
          // 7/15 만기 → 미도래(current)
          { id: 'a2', data: { counterparty: '(주)나다', amount: '30000000', dueDate: '2026-07-15' } },
          // 3/1 만기 → 121일 연체(d90plus, 대손 위험)
          { id: 'a3', data: { counterparty: '(주)다라', amount: '80000000', dueDate: '2026-03-01' } },
        ],
      },
    ],
  });
  const v = (name: string) => cro.metrics.find((m) => m.id === M(name))?.value;
  assert.equal(v('ar.total'), '160000000', '총 미수금');
  assert.equal(v('ar.bucket.current'), '30000000', '미도래');
  assert.equal(v('ar.bucket.d1_30'), '50000000', '1~30일 연체');
  assert.equal(v('ar.bucket.d61_90'), '0', '61~90일');
  assert.equal(v('ar.bucket.d90plus'), '80000000', '90일 초과(대손위험)');
  assert.equal(v('ar.overdue.total'), '130000000', '연체 합계(50M+80M)');
  assert.equal(v('ar.concentration'), '50.00', '최대 거래처 집중도 80M/160M');
});

test('90일+ 장기 연체 → 대손위험 플래그, 집중도 초과 → 경고', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.AR_AGING,
        rows: [
          { id: 'a1', data: { counterparty: '(주)다라', amount: '80000000', dueDate: '2026-03-01' } },
          { id: 'a2', data: { counterparty: '(주)나다', amount: '30000000', dueDate: '2026-07-15' } },
        ],
      },
    ],
  });
  const longOverdue = cro.flags.find((f) => f.type === 'ar_long_overdue');
  assert.ok(longOverdue, '90일+ 장기 연체 플래그 발화');
  assert.equal(longOverdue?.severity, 'WARN');
  const conc = cro.flags.find((f) => f.type === 'ar_concentration');
  assert.ok(conc, '집중도 초과 플래그(다라 72.7% > 30%)');
});

test('AR 데이터 없으면 AR metric 없음(자금 기존 기능 영향 없음)', () => {
  const cro = runCalcEngine({
    ...base,
    datasets: [
      {
        kind: DatasetKind.BANK_ACCOUNT_MASTER,
        rows: [{ id: 'm1', data: { accountAlias: '운영', openingBalance: '100000000' } }],
      },
    ],
  });
  assert.equal(cro.metrics.find((m) => m.id === M('ar.total')), undefined);
});
