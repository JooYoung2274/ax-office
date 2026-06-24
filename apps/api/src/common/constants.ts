/**
 * 전역 상수. BullMQ 큐 이름, 잡 이름, 감사 액션 등 매직스트링을 한 곳에 모은다.
 */

/** BullMQ 큐 이름 — PRD §6.3 (parse → calc → report 직렬 파이프라인). */
export const QUEUE_PARSE = 'parse-queue';
export const QUEUE_CALC = 'calc-queue';
export const QUEUE_REPORT = 'report-queue';

/** 잡 이름. */
export const JOB_PARSE = 'parse';
export const JOB_CALC = 'calc';
export const JOB_REPORT = 'report';

/** 감사 액션(AuditLog.action) 상수. */
export const AuditAction = {
  LOGIN: 'LOGIN',
  UPLOAD_RECEIVED: 'UPLOAD_RECEIVED',
  UPLOAD_COMMITTED: 'UPLOAD_COMMITTED',
  MAPPING_CONFIRMED: 'MAPPING_CONFIRMED',
  CALC_COMPLETED: 'CALC_COMPLETED',
  VALIDATION_BLOCKED: 'VALIDATION_BLOCKED',
  AI_INVOKED: 'AI_INVOKED',
  REPORT_CREATED: 'REPORT_CREATED',
  REPORT_DRAFTED: 'REPORT_DRAFTED',
  REPORT_NEEDS_HUMAN: 'REPORT_NEEDS_HUMAN',
  REPORT_APPROVED: 'REPORT_APPROVED',
  REPORT_REJECTED: 'REPORT_REJECTED',
  COMMENT_ADDED: 'COMMENT_ADDED',
  EXPORT: 'EXPORT',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * 안전한 BullMQ 커스텀 jobId 생성. ':'를 '-'로 치환(BullMQ는 ':'를 금지).
 * 멱등 키로 쓰여 동일 (name,id) 재시도가 중복 잡을 만들지 않는다.
 */
export function bullJobId(name: string, id: string): string {
  return `${name}-${id}`.replace(/:/g, '-');
}

/** BullMQ 공통 잡 옵션(멱등·재시도) — PRD §6.3. */
export const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 86_400 },
  removeOnFail: false, // 실패 job은 감사·재처리 위해 보존
};
