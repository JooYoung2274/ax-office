/**
 * @axaxax/calc-engine — 결정론 계산·검증 엔진.
 *
 * 단순계산 = 결정론 코드(이 패키지) → 이상징후/인사이트 = AI 리포트(다른 패키지) → 결론 = 사람.
 * 이 엔진의 출력 CRO는 AI가 인용 가능한 "유일한 숫자의 출처"이며 100% 결정론·decimal-safe다.
 */

// 필수 공개 API.
export { ENGINE_VERSION } from './types.js';
export type {
  RawRow,
  RawDataset,
  CalcEngineInput,
  Thresholds,
} from './types.js';
export { DEFAULT_THRESHOLDS, DatasetKind } from './types.js';
export { runCalcEngine } from './engine.js';

// ID 헬퍼(다른 패키지의 evidence_ref 검증·생성에 사용).
export { metricId, flagId } from './ids.js';

// decimal 헬퍼(decimal-safe 연산 재사용).
export * as decimal from './decimal.js';

// 레지스트리 타입(metric/rule 확장용).
export type { MetricDef, FlagDef, MetricResult } from './registry.js';
export type { ValidationRule } from './validation/engine.js';
export { runValidation } from './validation/engine.js';
export { ALL_RULES, CASH_RULES, CLOSING_RULES } from './validation/rules.js';

// 재내보내기: shared CRO 타입(편의).
export type { Cro, Metric, Flag, ValidationReport, ValidationIssue, Severity } from '@axaxax/shared';
