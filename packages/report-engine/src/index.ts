/**
 * @axaxax/report-engine — AI ReportEngine 공개 API.
 *
 * 철학(PRD): 계산 = 결정론 코드(CRO 생성) / 이상·인사이트 = AI 리포트(이 패키지) /
 * 결론 = 사람 승인. AI는 CRO 밖의 숫자를 절대 만들지 못한다 — runGuard가 기계적으로 차단.
 *
 * NestJS api 패키지는 아래 공개 시그니처에 정확히 의존한다.
 */

export type { LlmClient, LlmGenerateParams, LlmGenerateResult } from './llm.js';
export { AnthropicLlmClient } from './anthropic-client.js';
export { runGuard } from './guard.js';
export { ReportEngine } from './engine.js';
export type { GenerateOutcome } from './engine.js';
export type { ReportKind } from './prompts.js';

// 프롬프트 구성요소(감사·테스트·디버깅 노출용 — 캐시 prefix 후보).
export {
  FROZEN_RULES_BLOCK,
  OUTPUT_SCHEMA_DESCRIPTION,
  CASH_DOMAIN_HEADER,
  CLOSING_DOMAIN_HEADER,
  buildSystemPrompt,
  buildUserMessage,
  buildCorrectiveAppendix,
} from './prompts.js';

// 가드 내부 헬퍼(단위 테스트·디버깅용).
export { extractNumbers } from './guard.js';
