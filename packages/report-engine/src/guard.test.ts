/**
 * runGuard 순수 함수 단위 테스트 — 네트워크 없음.
 * PRD §5.6의 (b)/(c)/(e)를 손으로 만든 CRO + 여러 ReportContent 픽스처로 검증한다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Cro, ReportContent } from '@axaxax/shared';
import { runGuard, extractNumbers } from './guard.js';

/** 손으로 만든 CRO 픽스처: 자금일보(cash) 도메인. */
function makeCro(): Cro {
  return {
    engineVersion: 'calc-engine@2.3.1',
    tenantId: 't_single_mvp',
    domain: 'cash',
    period: '2026-06',
    generatedAt: '2026-06-24T02:00:00Z',
    inputsHash: 'sha256:abc',
    metrics: [
      {
        id: 'cf.2026-06.opening_balance',
        name: '월초 현금잔액',
        value: '1850000000',
        unit: 'KRW',
        period: '2026-06',
        sourceRowIds: ['row:1'],
      },
      {
        id: 'cf.2026-06.projected_min_balance',
        name: '예측 최저잔액(D+30)',
        value: '95000000',
        unit: 'KRW',
        period: '2026-06',
        sourceRowIds: ['row:2'],
      },
      {
        id: 'cf.2026-06.liquidity_buffer_days',
        name: '유동성 버퍼(일)',
        value: '12',
        unit: 'DAYS',
        period: '2026-06',
        sourceRowIds: [],
      },
    ],
    flags: [
      {
        id: 'cf.2026-06.flag.min_balance_below_threshold',
        type: 'LIQ-001',
        severity: 'WARN',
        message: '예측 최저잔액 < 안전한도(1억원)',
        value: '95000000',
        expected: '100000000',
        evidenceCells: [],
        sourceRowIds: [],
      },
    ],
    validationSummary: {
      issues: [],
      counts: { fatal: 0, warn: 1, info: 0 },
      blockedAI: false,
    },
  };
}

test('valid report → ok, no violations', () => {
  const cro = makeCro();
  const content: ReportContent = {
    summary:
      '월초 현금잔액은 1,850,000,000원이며 예측 최저잔액은 95,000,000원으로 안전한도(100,000,000원)를 하회할 것으로 예측된다.',
    findings: [
      {
        id: 'F001',
        area: 'liquidity',
        severity: 'WARN',
        observation:
          '예측 최저잔액 95,000,000원이 안전한도 100,000,000원을 하회한다(예측치). 유동성 버퍼는 12일이다.',
        evidence_refs: [
          'cf.2026-06.projected_min_balance',
          'cf.2026-06.flag.min_balance_below_threshold',
          'cf.2026-06.liquidity_buffer_days',
        ],
        rootCauseHypothesis: '대규모 지급 집중일이 원인일 가능성이 있어 확인이 필요하다.',
      },
    ],
    recommendations: [],
    confidence: 0.7,
    dataCaveats: ['2026-06-15 거래 일부 누락 경고 존재.'],
  };

  const res = runGuard(cro, content);
  assert.equal(res.ok, true, JSON.stringify(res.violations));
  assert.equal(res.violations.length, 0);
});

test('억 단위 축약 표기도 그라운딩된다 (18.5억 ↔ 1,850,000,000)', () => {
  const cro = makeCro();
  const content: ReportContent = {
    summary: '월초 현금잔액은 약 18.5억원이다.',
    findings: [],
    recommendations: [],
    confidence: 0.6,
    dataCaveats: ['요약 표기.'],
  };
  const res = runGuard(cro, content);
  assert.equal(res.ok, true, JSON.stringify(res.violations));
});

test('unknown evidence_ref → UNKNOWN_EVIDENCE_REF', () => {
  const cro = makeCro();
  const content: ReportContent = {
    summary: '예측 최저잔액은 95,000,000원이다.',
    findings: [
      {
        id: 'F001',
        area: 'liquidity',
        severity: 'WARN',
        observation: '예측 최저잔액 95,000,000원.',
        evidence_refs: ['cf.2026-06.does_not_exist'], // 존재하지 않는 ID
        rootCauseHypothesis: '확인이 필요하다.',
      },
    ],
    recommendations: [],
    confidence: 0.6,
    dataCaveats: ['x'],
  };
  const res = runGuard(cro, content);
  assert.equal(res.ok, false);
  const v = res.violations.find((x) => x.kind === 'UNKNOWN_EVIDENCE_REF');
  assert.ok(v, '반드시 UNKNOWN_EVIDENCE_REF 위반이 있어야 한다');
  assert.equal(v?.findingId, 'F001');
});

test('ungrounded number → UNGROUNDED_NUMBER', () => {
  const cro = makeCro();
  const content: ReportContent = {
    summary: '예측 최저잔액은 77,000,000원으로 추정된다.', // CRO에 없는 숫자
    findings: [
      {
        id: 'F001',
        area: 'liquidity',
        severity: 'WARN',
        observation: '예측 최저잔액 95,000,000원.',
        evidence_refs: ['cf.2026-06.projected_min_balance'],
        rootCauseHypothesis: '확인이 필요하다.',
      },
    ],
    recommendations: [],
    confidence: 0.6,
    dataCaveats: ['x'],
  };
  const res = runGuard(cro, content);
  assert.equal(res.ok, false);
  const v = res.violations.find((x) => x.kind === 'UNGROUNDED_NUMBER');
  assert.ok(v, '반드시 UNGROUNDED_NUMBER 위반이 있어야 한다');
  assert.equal(v?.findingId, undefined, 'summary 위반은 findingId가 없다');
});

test('ungrounded number in observation → UNGROUNDED_NUMBER with findingId', () => {
  const cro = makeCro();
  const content: ReportContent = {
    summary: '월초 현금잔액은 1,850,000,000원이다.',
    findings: [
      {
        id: 'F009',
        area: 'liquidity',
        severity: 'WARN',
        observation: '부족액은 320,000,000원으로 추정된다.', // CRO에 없음
        evidence_refs: ['cf.2026-06.projected_min_balance'],
        rootCauseHypothesis: '확인이 필요하다.',
      },
    ],
    recommendations: [],
    confidence: 0.6,
    dataCaveats: ['x'],
  };
  const res = runGuard(cro, content);
  assert.equal(res.ok, false);
  const v = res.violations.find((x) => x.kind === 'UNGROUNDED_NUMBER' && x.findingId === 'F009');
  assert.ok(v);
});

test('missing evidence (empty evidence_refs) → MISSING_EVIDENCE', () => {
  const cro = makeCro();
  // 스키마(min(1))는 보통 막지만, 가드는 방어적으로 재검사한다.
  // 직접 빈 배열을 주입해 가드 단독 동작을 검증.
  const content = {
    summary: '월초 현금잔액은 1,850,000,000원이다.',
    findings: [
      {
        id: 'F001',
        area: 'liquidity',
        severity: 'WARN',
        observation: '월초 현금잔액 1,850,000,000원.',
        evidence_refs: [] as string[],
        rootCauseHypothesis: '확인이 필요하다.',
      },
    ],
    recommendations: [],
    confidence: 0.6,
    dataCaveats: ['x'],
  } as unknown as ReportContent;

  const res = runGuard(cro, content);
  assert.equal(res.ok, false);
  const v = res.violations.find((x) => x.kind === 'MISSING_EVIDENCE' && x.findingId === 'F001');
  assert.ok(v);
});

test('percent / days are grounded against CRO unit values', () => {
  const cro = makeCro();
  const content: ReportContent = {
    summary: '유동성 버퍼는 12일이다.', // 12 ∈ CRO (liquidity_buffer_days)
    findings: [],
    recommendations: [],
    confidence: 0.6,
    dataCaveats: ['x'],
  };
  const res = runGuard(cro, content);
  assert.equal(res.ok, true, JSON.stringify(res.violations));
});

test('extractNumbers handles commas, 억/만, percent, parentheses-negative', () => {
  assert.deepEqual(extractNumbers('1,850,000,000원').includes(1850000000), true);
  assert.equal(extractNumbers('320억').includes(32000000000), true);
  assert.equal(extractNumbers('320억').includes(320), true);
  assert.equal(extractNumbers('280만').includes(2800000), true);
  assert.equal(extractNumbers('12일').includes(12), true);
  assert.equal(extractNumbers('15%').includes(15), true);
  assert.equal(extractNumbers('(1,000)').includes(-1000), true);
});

test('multiple violations accumulate', () => {
  const cro = makeCro();
  const content: ReportContent = {
    summary: '예측 최저잔액 77,000,000원, 부족액 320,000,000원.', // 둘 다 ungrounded
    findings: [
      {
        id: 'F001',
        area: 'liquidity',
        severity: 'WARN',
        observation: '값 95,000,000원.',
        evidence_refs: ['cf.2026-06.ghost'], // unknown
        rootCauseHypothesis: '확인 필요.',
      },
    ],
    recommendations: [],
    confidence: 0.5,
    dataCaveats: ['x'],
  };
  const res = runGuard(cro, content);
  assert.equal(res.ok, false);
  assert.ok(res.violations.length >= 3, `위반이 3건 이상이어야 함: ${res.violations.length}`);
  assert.ok(res.violations.some((v) => v.kind === 'UNKNOWN_EVIDENCE_REF'));
  assert.ok(res.violations.some((v) => v.kind === 'UNGROUNDED_NUMBER'));
});
