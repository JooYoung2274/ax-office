import { z } from 'zod';
import { SeveritySchema } from './cro.js';

/**
 * AI 리포트 출력 스키마(엄격) — PRD §5.2.
 * Claude는 이 스키마로만 출력하며, finding의 evidence_refs는 CRO 항목ID만 허용.
 * 후처리 검증기(§5.6)가 evidence_ref 유효성과 숫자 그라운딩을 기계 검증한다.
 */

export const FindingSchema = z.object({
  id: z.string(),
  /** 영역. 예: 'liquidity' | 'closing' | 'reconciliation'. */
  area: z.string(),
  severity: SeveritySchema,
  /** 관측 사실(서술). 모든 수치는 evidence_refs로 뒷받침되어야 한다. */
  observation: z.string(),
  /** CRO 항목ID(metricId/flagId)만 허용. 근거 없는 주장 금지. */
  evidence_refs: z.array(z.string()).min(1),
  rootCauseHypothesis: z.string(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const RecommendationSchema = z.object({
  id: z.string(),
  action: z.string(),
  impact: z.enum(['high', 'medium', 'low']),
  effort: z.enum(['high', 'medium', 'low']),
  linkedFindingIds: z.array(z.string()).default([]),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

/** Claude가 생성하는 리포트 본문. */
export const ReportContentSchema = z.object({
  summary: z.string(),
  findings: z.array(FindingSchema).default([]),
  recommendations: z.array(RecommendationSchema).default([]),
  /** 0~1. AI의 자기 확신도. */
  confidence: z.number().min(0).max(1),
  /** 데이터 한계·추정 명시(예: "6월 일부 거래 미반영"). */
  dataCaveats: z.array(z.string()).default([]),
});
export type ReportContent = z.infer<typeof ReportContentSchema>;

/** 후처리 검증기(§5.6) 결과. */
export interface GuardViolation {
  kind: 'UNKNOWN_EVIDENCE_REF' | 'UNGROUNDED_NUMBER' | 'MISSING_EVIDENCE';
  findingId?: string;
  detail: string;
}

export interface GuardResult {
  ok: boolean;
  violations: GuardViolation[];
}
