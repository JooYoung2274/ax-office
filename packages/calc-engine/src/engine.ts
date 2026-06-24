/**
 * engine.ts — runCalcEngine 오케스트레이션.
 *
 * 흐름(PRD §1.1, §4):
 *   1) 컨텍스트 구성(정렬된 데이터셋 맵).
 *   2) ValidationEngine 실행 → ValidationReport. blockedAI=(fatal>0).
 *   3) (blocked여도) metric 레지스트리 실행 → metrics[].
 *   4) flag 레지스트리 실행(metrics 참조) → flags[].
 *   5) CRO 조립. validationSummary 박제. generatedAt은 입력 우선.
 *
 * 결정론: 모든 수치는 입력만으로 산출. 비결정 허용은 generatedAt 타임스탬프 단 하나.
 */
import { Cro, Flag, Metric } from '@axaxax/shared';
import { flagId, metricId } from './ids.js';
import { CASH_METRICS } from './metrics/cash.js';
import { CASH_FLAGS } from './metrics/cash-flags.js';
import { CLOSING_METRICS } from './metrics/closing.js';
import { CLOSING_FLAGS } from './metrics/closing-flags.js';
import { FlagDef, MetricDef, MetricResult } from './registry.js';
import {
  CalcContext,
  CalcEngineInput,
  DEFAULT_THRESHOLDS,
  ENGINE_VERSION,
  RawRow,
  Thresholds,
} from './types.js';
import { runValidation } from './validation/engine.js';
import { ALL_RULES } from './validation/rules.js';

/** 입력 데이터셋을 결정론적 컨텍스트로. rows는 입력 순서 유지(안정). */
function buildContext(input: CalcEngineInput, thresholds: Thresholds): CalcContext {
  const datasets = new Map<string, RawRow[]>();
  for (const ds of input.datasets) {
    const existing = datasets.get(ds.kind) ?? [];
    existing.push(...ds.rows);
    datasets.set(ds.kind, existing);
  }
  return {
    tenantId: input.tenantId,
    domain: input.domain,
    period: input.period,
    inputsHash: input.inputsHash,
    thresholds,
    datasets,
    rows(kind: string): RawRow[] {
      return datasets.get(kind) ?? [];
    },
  };
}

/** MetricDef 한 개를 실행해 0..n개의 Metric으로 전개. */
function runMetricDef(ctx: CalcContext, def: MetricDef): Metric[] {
  const res = def.compute(ctx);
  if (res === null) return [];
  const list: MetricResult[] = Array.isArray(res) ? res : [res];
  return list.map((r) => {
    const name = r.nameOverride ?? def.name;
    return {
      id: metricId(ctx.domain, ctx.period, name),
      name: def.label,
      value: r.value,
      unit: r.unit,
      period: ctx.period,
      formula: r.formula,
      sourceRowIds: r.sourceRowIds ?? [],
    } satisfies Metric;
  });
}

/** FlagDef 한 개를 실행해 0..n개의 Flag으로 전개. */
function runFlagDef(ctx: CalcContext, def: FlagDef, metrics: Metric[]): Flag[] {
  const res = def.compute(ctx, metrics);
  if (!res) return [];
  return res.map((f, i) => ({
    id: flagId(ctx.domain, ctx.period, res.length > 1 ? `${def.name}.${i}` : def.name),
    ...f,
  }));
}

/**
 * 결정론 계산/검증 엔진의 단일 진입점.
 * 검증을 먼저 돌리고, metric/flag를 조립해 CRO를 반환한다.
 * FATAL 존재 시 blockedAI=true이며 metrics는 부분적일 수 있으나 항상 유효한 CRO를 반환한다.
 */
export function runCalcEngine(input: CalcEngineInput): Cro {
  const thresholds: Thresholds = { ...DEFAULT_THRESHOLDS, ...(input.thresholds ?? {}) };
  const ctx = buildContext(input, thresholds);

  // 1) 검증(게이트).
  const validationSummary = runValidation(ctx, ALL_RULES);

  // 2) metric 레지스트리(도메인별).
  const metricDefs = input.domain === 'cash' ? CASH_METRICS : CLOSING_METRICS;
  const metrics: Metric[] = [];
  for (const def of metricDefs) {
    metrics.push(...runMetricDef(ctx, def));
  }

  // 3) flag 레지스트리(metric 참조).
  const flagDefs = input.domain === 'cash' ? CASH_FLAGS : CLOSING_FLAGS;
  const flags: Flag[] = [];
  for (const def of flagDefs) {
    flags.push(...runFlagDef(ctx, def, metrics));
  }

  // 4) CRO 조립. generatedAt만 비결정 허용(입력 우선).
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  return {
    engineVersion: ENGINE_VERSION,
    tenantId: input.tenantId,
    domain: input.domain,
    period: input.period,
    generatedAt,
    inputsHash: input.inputsHash,
    metrics,
    flags,
    validationSummary,
  } satisfies Cro;
}
