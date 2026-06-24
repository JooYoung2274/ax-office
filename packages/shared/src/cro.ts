import { z } from 'zod';

/**
 * CRO (Calculation Result Object) — PRD §5.1.
 * 결정론 엔진의 출력이자 AI가 인용 가능한 "유일한 숫자의 출처".
 * AI 리포트의 모든 수치는 metricId/flagId(evidence_ref)로만 이 객체를 참조한다.
 */

/** 검증 등급. FATAL이 1건이라도 있으면 AI 호출이 차단된다. */
export const SeveritySchema = z.enum(['FATAL', 'WARN', 'INFO']);
export type Severity = z.infer<typeof SeveritySchema>;

/** 단일 계산 수치. metricId 규칙: `{domain}.{period}.{name}` (예: cf.2026-06.net_change) */
export const MetricSchema = z.object({
  /** 안정적 ID. evidence_ref가 참조하는 종착점. */
  id: z.string(),
  name: z.string(),
  /** decimal-safe 직렬화를 위해 문자열로 보관(금액·비율). */
  value: z.string(),
  unit: z.enum(['KRW', 'PERCENT', 'RATIO', 'DAYS', 'COUNT']),
  period: z.string(),
  /** 사람이 읽을 산식 설명(감사용). */
  formula: z.string().optional(),
  /** 이 수치가 유래한 RawRow 역참조(근거 추적의 종착점). */
  sourceRowIds: z.array(z.string()).default([]),
});
export type Metric = z.infer<typeof MetricSchema>;

/** 결정론 규칙이 탐지한 이상징후/경보. 코드는 '플래그'만, 해석은 AI가. */
export const FlagSchema = z.object({
  /** flagId. 예: cf.2026-06.flag.min_balance_below_threshold */
  id: z.string(),
  type: z.string(),
  severity: SeveritySchema,
  message: z.string(),
  accountId: z.string().optional(),
  /** 관측값/기대값(decimal-safe 문자열). */
  value: z.string().optional(),
  expected: z.string().optional(),
  /** 근거 셀/행 포인터. */
  evidenceCells: z.array(z.string()).default([]),
  sourceRowIds: z.array(z.string()).default([]),
});
export type Flag = z.infer<typeof FlagSchema>;

/** 검증 1건. */
export const ValidationIssueSchema = z.object({
  ruleId: z.string(),
  severity: SeveritySchema,
  message: z.string(),
  accountId: z.string().optional(),
  sourceRowIds: z.array(z.string()).default([]),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/** ValidationEngine 산출 — PRD §4.2. */
export const ValidationReportSchema = z.object({
  issues: z.array(ValidationIssueSchema).default([]),
  counts: z.object({
    fatal: z.number().int().nonnegative(),
    warn: z.number().int().nonnegative(),
    info: z.number().int().nonnegative(),
  }),
  /** FATAL 존재 시 true — AI 호출 게이트를 닫는다. */
  blockedAI: z.boolean(),
});
export type ValidationReport = z.infer<typeof ValidationReportSchema>;

export const CroSchema = z.object({
  /** 결정론 엔진 버전(재현성·감사). CRO에 박제. */
  engineVersion: z.string(),
  tenantId: z.string(),
  /** 도메인. MVP: 'cash'(자금일보) | 'closing'(월결산) | 'payroll'(급여·4대보험). */
  domain: z.enum(['cash', 'closing', 'payroll']),
  /** 회계 기간. 예: '2026-06' 또는 '2026-06-24'. */
  period: z.string(),
  generatedAt: z.string(),
  /** 입력 데이터 스냅샷 해시(SHA-256). garbage-in 추적. */
  inputsHash: z.string(),
  metrics: z.array(MetricSchema).default([]),
  flags: z.array(FlagSchema).default([]),
  validationSummary: ValidationReportSchema,
});
export type Cro = z.infer<typeof CroSchema>;

/** evidence_ref가 유효한지(CRO에 실재하는 metricId/flagId인지) 검사용 헬퍼. */
export function collectEvidenceIds(cro: Cro): Set<string> {
  const ids = new Set<string>();
  for (const m of cro.metrics) ids.add(m.id);
  for (const f of cro.flags) ids.add(f.id);
  return ids;
}
