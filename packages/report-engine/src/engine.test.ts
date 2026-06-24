/**
 * ReportEngine 통합 테스트 — FAKE in-memory LlmClient(네트워크 없음).
 * (1) 깨끗한 리포트 → DRAFT
 * (2) bad evidence_ref 반복 → maxRegen 초과 후 NEEDS_HUMAN
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Cro } from '@axaxax/shared';
import { ReportEngine } from './engine.js';
import type { LlmClient, LlmGenerateParams, LlmGenerateResult } from './llm.js';

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
        id: 'cf.2026-06.projected_min_balance',
        name: '예측 최저잔액',
        value: '95000000',
        unit: 'KRW',
        period: '2026-06',
        sourceRowIds: ['row:2'],
      },
    ],
    flags: [
      {
        id: 'cf.2026-06.flag.min_balance_below_threshold',
        type: 'LIQ-001',
        severity: 'WARN',
        message: '예측 최저잔액 < 안전한도',
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

/** 호출마다 정해진 텍스트를 순서대로 반환하는 fake. 네트워크 없음. */
class ScriptedLlmClient implements LlmClient {
  public calls: LlmGenerateParams[] = [];
  constructor(private readonly scripts: string[]) {}
  async generate(params: LlmGenerateParams): Promise<LlmGenerateResult> {
    this.calls.push(params);
    const idx = Math.min(this.calls.length - 1, this.scripts.length - 1);
    const text = this.scripts[idx] ?? '';
    return { text, usage: { input_tokens: 10, output_tokens: 20 } };
  }
  /** noUncheckedIndexedAccess 하에서 안전하게 n번째 호출 파라미터를 꺼낸다. */
  call(i: number): LlmGenerateParams {
    const c = this.calls[i];
    if (c == null) throw new Error(`call ${i} 없음 (총 ${this.calls.length}회)`);
    return c;
  }
}

const CLEAN_REPORT = JSON.stringify({
  summary:
    '예측 최저잔액은 95,000,000원으로 안전한도(100,000,000원)를 하회할 것으로 예측된다.',
  findings: [
    {
      id: 'F001',
      area: 'liquidity',
      severity: 'WARN',
      observation: '예측 최저잔액 95,000,000원이 안전한도 100,000,000원을 하회한다(예측치).',
      evidence_refs: [
        'cf.2026-06.projected_min_balance',
        'cf.2026-06.flag.min_balance_below_threshold',
      ],
      rootCauseHypothesis: '지급 집중일이 원인일 가능성이 있어 확인이 필요하다.',
    },
  ],
  recommendations: [],
  confidence: 0.7,
  dataCaveats: ['일부 거래 누락 경고 존재.'],
});

const BAD_REF_REPORT = JSON.stringify({
  summary: '예측 최저잔액은 95,000,000원이다.',
  findings: [
    {
      id: 'F001',
      area: 'liquidity',
      severity: 'WARN',
      observation: '예측 최저잔액 95,000,000원.',
      evidence_refs: ['cf.2026-06.ghost_metric'], // CRO에 없는 ID → 항상 가드 실패
      rootCauseHypothesis: '확인이 필요하다.',
    },
  ],
  recommendations: [],
  confidence: 0.6,
  dataCaveats: ['x'],
});

test('(1) clean report → DRAFT on first attempt', async () => {
  const cro = makeCro();
  const llm = new ScriptedLlmClient([CLEAN_REPORT]);
  const engine = new ReportEngine(llm, { maxRegen: 2 });

  const outcome = await engine.generate(cro, 'cash');

  assert.equal(outcome.status, 'DRAFT');
  assert.equal(outcome.guard.ok, true, JSON.stringify(outcome.guard.violations));
  assert.equal(outcome.regenCount, 0);
  assert.equal(llm.calls.length, 1, '깨끗하면 1회만 호출');
  assert.equal(outcome.usage?.input_tokens, 10);
});

test('(2) bad evidence_ref repeated → NEEDS_HUMAN after maxRegen', async () => {
  const cro = makeCro();
  // 항상 bad ref만 반환 → 매번 가드 실패.
  const llm = new ScriptedLlmClient([BAD_REF_REPORT]);
  const engine = new ReportEngine(llm, { maxRegen: 2 });

  const outcome = await engine.generate(cro, 'cash');

  assert.equal(outcome.status, 'NEEDS_HUMAN');
  assert.equal(outcome.guard.ok, false);
  assert.equal(outcome.regenCount, 2, 'maxRegen까지 재생성');
  assert.equal(llm.calls.length, 3, '최초 1회 + 재생성 2회 = 3회 호출');
  assert.ok(
    outcome.guard.violations.some((v) => v.kind === 'UNKNOWN_EVIDENCE_REF'),
    '미통과 사유에 UNKNOWN_EVIDENCE_REF 포함',
  );
});

test('regeneration appends corrective feedback but keeps system prefix stable', async () => {
  const cro = makeCro();
  // 1회차 실패, 2회차 통과 → DRAFT with regenCount=1
  const llm = new ScriptedLlmClient([BAD_REF_REPORT, CLEAN_REPORT]);
  const engine = new ReportEngine(llm, { maxRegen: 2 });

  const outcome = await engine.generate(cro, 'cash');

  assert.equal(outcome.status, 'DRAFT');
  assert.equal(outcome.regenCount, 1);
  assert.equal(llm.calls.length, 2);

  // system(캐시 prefix)은 호출 간 byte-identical 해야 한다.
  assert.equal(llm.call(0).system, llm.call(1).system, 'system prefix는 재호출에도 동일');
  // 재생성 user에는 교정 지시가 덧붙는다.
  assert.ok(llm.call(1).user.length > llm.call(0).user.length);
  assert.match(llm.call(1).user, /자동 검증 실패/);
});

test('schema-invalid output is treated as guard failure and regenerated', async () => {
  const cro = makeCro();
  // 1회차: 깨진 JSON(스키마 실패) → 2회차: clean → DRAFT
  const llm = new ScriptedLlmClient(['{not valid json', CLEAN_REPORT]);
  const engine = new ReportEngine(llm, { maxRegen: 2 });

  const outcome = await engine.generate(cro, 'cash');

  assert.equal(outcome.status, 'DRAFT');
  assert.equal(outcome.regenCount, 1);
  assert.equal(llm.calls.length, 2);
});

test('maxRegen=0 → single attempt only', async () => {
  const cro = makeCro();
  const llm = new ScriptedLlmClient([BAD_REF_REPORT]);
  const engine = new ReportEngine(llm, { maxRegen: 0 });

  const outcome = await engine.generate(cro, 'cash');

  assert.equal(outcome.status, 'NEEDS_HUMAN');
  assert.equal(outcome.regenCount, 0);
  assert.equal(llm.calls.length, 1);
});

test('closing domain prompt selected for kind=closing', async () => {
  const cro: Cro = { ...makeCro(), domain: 'closing' };
  const llm = new ScriptedLlmClient([CLEAN_REPORT]);
  const engine = new ReportEngine(llm, { maxRegen: 1 });

  await engine.generate(cro, 'closing');
  assert.match(llm.call(0).system, /월 결산 \/ 이상 분개 \/ 계정 대사/);
});
