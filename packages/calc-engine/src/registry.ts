/**
 * registry.ts — 선언적 metric/flag 레지스트리.
 *
 * 각 metric은 순수함수 compute(ctx)를 가지며, MetricResult(또는 null/[])를 반환한다.
 * 엔진은 등록 순서대로 compute를 호출해 CRO.metrics[] / CRO.flags[]를 조립한다.
 *
 * metric 추가법: compute가 MetricResult[]를 반환하는 MetricDef를 작성해
 *   CASH_METRICS / CLOSING_METRICS 배열에 push 하면 끝. (README 참조)
 */
import { Flag, Metric } from '@axaxax/shared';
import { CalcContext } from './types.js';

/** compute가 직접 생성하는 단일 수치(아직 id 미부여 가능 — def가 id를 채운다). */
export interface MetricResult {
  /** def.idName을 덮어쓸 수 있는 name 슬러그(시계열·버킷 등 다중 산출 시). */
  nameOverride?: string;
  value: string;
  unit: Metric['unit'];
  formula?: string;
  sourceRowIds?: string[];
}

/** 선언적 metric 정의. */
export interface MetricDef {
  /** name 슬러그. metricId의 `{name}` 부분(예: 'bank_balance.total'). */
  name: string;
  /** 사람이 읽는 라벨. */
  label: string;
  unit: Metric['unit'];
  /** 순수함수. 단일/다중 수치 또는 비계산(null/빈배열) 반환. */
  compute(ctx: CalcContext): MetricResult | MetricResult[] | null;
}

/** flag 정의(코드는 '플래그'만, 해석은 AI). */
export interface FlagDef {
  /** flagId의 `{name}` 부분. */
  name: string;
  type: string;
  /** 이미 산출된 metrics를 참조해 플래그를 만든다. */
  compute(ctx: CalcContext, metrics: Metric[]): Omit<Flag, 'id'>[] | null;
}
