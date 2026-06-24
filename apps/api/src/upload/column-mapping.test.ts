import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestMapping } from './column-mapping';

/**
 * 컬럼 매핑은 datasetKind로 스코프되어야 한다.
 * 동일 한글 헤더 '구분'이 데이터셋에 따라 다른 표준필드로 매핑된다:
 *  - cashflow_schedule: '구분' → direction (수금/지급)
 *  - bank_transactions: '거래구분'/'구분' → txnType
 * 스코프가 없으면 전역 동의어 사전 순서에 따라 '구분'이 잘못 매핑되어
 * 자금 스케줄의 direction이 비고, 유동성 예측이 조용히 깨진다(W2 버그).
 */
test('cashflow_schedule에서 "구분"은 direction으로 매핑된다', () => {
  const candidates = suggestMapping(
    ['예정일자', '구분', '항목유형', '금액'],
    'cashflow_schedule',
  );
  const byCol = Object.fromEntries(
    candidates.map((c) => [c.sourceColumn, c.suggestedField]),
  );
  assert.equal(byCol['예정일자'], 'scheduledDate');
  assert.equal(byCol['구분'], 'direction');
  assert.equal(byCol['항목유형'], 'itemType');
  assert.equal(byCol['금액'], 'amount');
});

test('bank_transactions에서 "거래구분"은 txnType, 자금 필드들이 매핑된다', () => {
  const candidates = suggestMapping(
    ['거래일자', '계좌별칭', '입금액', '출금액', '거래구분'],
    'bank_transactions',
  );
  const byCol = Object.fromEntries(
    candidates.map((c) => [c.sourceColumn, c.suggestedField]),
  );
  assert.equal(byCol['거래일자'], 'txnDate');
  assert.equal(byCol['계좌별칭'], 'accountAlias');
  assert.equal(byCol['입금액'], 'depositAmt');
  assert.equal(byCol['출금액'], 'withdrawalAmt');
  assert.equal(byCol['거래구분'], 'txnType');
});

test('스코프 밖 필드는 제안되지 않는다 (bank_transactions에 회계기간 헤더)', () => {
  const candidates = suggestMapping(
    ['거래일자', '계좌별칭', '입금액', '출금액', '회계기간'],
    'bank_transactions',
  );
  const period = candidates.find((c) => c.sourceColumn === '회계기간');
  assert.equal(period?.suggestedField, null);
});
