import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleDatasets } from './assemble';

/**
 * cash CRO는 3개 데이터셋(계좌마스터+거래내역+스케줄)이 필요한데,
 * 업로드는 1파일=1데이터셋이라 기간 내 여러 배치를 kind별로 병합해야 한다.
 */
test('동일 kind의 여러 배치 행을 하나의 데이터셋으로 병합한다', () => {
  const ds = assembleDatasets([
    { kind: 'bank_transactions', rows: [{ id: 'a', data: { x: '1' } }] },
    { kind: 'bank_transactions', rows: [{ id: 'b', data: { x: '2' } }] },
    { kind: 'bank_account_master', rows: [{ id: 'm', data: {} }] },
  ]);
  assert.equal(ds.length, 2);
  const tx = ds.find((d) => d.kind === 'bank_transactions');
  assert.deepEqual(
    tx?.rows.map((r) => r.id),
    ['a', 'b'],
  );
  assert.equal(ds.find((d) => d.kind === 'bank_account_master')?.rows.length, 1);
});

test('kind 순서는 결정론적(정렬)이다', () => {
  const ds = assembleDatasets([
    { kind: 'cashflow_schedule', rows: [] },
    { kind: 'bank_account_master', rows: [] },
    { kind: 'bank_transactions', rows: [] },
  ]);
  assert.deepEqual(
    ds.map((d) => d.kind),
    ['bank_account_master', 'bank_transactions', 'cashflow_schedule'],
  );
});

test('빈 입력 → 빈 배열', () => {
  assert.deepEqual(assembleDatasets([]), []);
});
