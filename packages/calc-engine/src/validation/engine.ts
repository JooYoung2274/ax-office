/**
 * validation/engine.ts — ValidationEngine (PRD §4.2).
 *
 * 규칙 레지스트리를 순회해 RuleIssue[]를 수집하고, ValidationReport로 집계한다.
 * blockedAI = (fatal > 0). FATAL 1건이라도 있으면 상위 오케스트레이터가 AI 호출을 차단.
 */
import { Severity, ValidationIssue, ValidationReport } from '@axaxax/shared';
import { CalcContext, RuleIssue } from '../types.js';

/** 검증 규칙 — 순수함수. ctx를 읽어 RuleIssue[]를 반환. */
export interface ValidationRule {
  ruleId: string;
  severity: Severity;
  /** 이 도메인에서만 평가(미지정 시 전 도메인). */
  domains?: Array<'cash' | 'closing' | 'payroll'>;
  evaluate(ctx: CalcContext): RuleIssue[];
}

function toIssue(r: RuleIssue): ValidationIssue {
  return {
    ruleId: r.ruleId,
    severity: r.severity,
    message: r.message,
    accountId: r.accountId,
    sourceRowIds: r.sourceRowIds ?? [],
  };
}

/**
 * 규칙 집합을 평가해 ValidationReport를 만든다.
 * 결정론: 규칙은 등록 순서대로 평가되고, 각 규칙 내부도 안정 정렬을 전제로 한다.
 */
export function runValidation(ctx: CalcContext, rules: ValidationRule[]): ValidationReport {
  const issues: ValidationIssue[] = [];
  for (const rule of rules) {
    if (rule.domains && !rule.domains.includes(ctx.domain)) continue;
    for (const ri of rule.evaluate(ctx)) {
      issues.push(toIssue(ri));
    }
  }

  let fatal = 0;
  let warn = 0;
  let info = 0;
  for (const i of issues) {
    if (i.severity === 'FATAL') fatal++;
    else if (i.severity === 'WARN') warn++;
    else info++;
  }

  return {
    issues,
    counts: { fatal, warn, info },
    blockedAI: fatal > 0,
  };
}
