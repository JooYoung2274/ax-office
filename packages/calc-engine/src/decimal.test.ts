/**
 * decimal.test.ts — decimal 안전연산 정확성(PRD §4.0/§4.4).
 * raw float가 틀리는 케이스(0.1+0.2)와 누적·반올림을 검증한다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { add, div, moneyString, mul, ratioString, sum, toFixedString } from './decimal.js';

test('0.1 + 0.2 === 0.3 (float가 틀리는 케이스)', () => {
  assert.equal(add('0.1', '0.2').toString(), '0.3');
});

test('대금액 합산 정밀(원 단위 누적)', () => {
  const total = sum(['1850000000', '1100000000', '-1400000000']);
  assert.equal(moneyString(total), '1550000000');
});

test('ROUND_HALF_UP 표시 반올림', () => {
  assert.equal(toFixedString('2.005', 2), '2.01');
  assert.equal(ratioString('33.335'), '33.34');
});

test('분모 0/음수 가드 → null', () => {
  assert.equal(div('100', '0'), null);
  assert.equal(div('100', '-5'), null);
  assert.equal(div('100', '-5', true)?.toString(), '-20');
});

test('비율 계산 (당기−전기)/|전기|×100', () => {
  const pct = mul(div(add('1200', '-1000')!, '1000')!, 100);
  assert.equal(ratioString(pct), '20.00');
});
