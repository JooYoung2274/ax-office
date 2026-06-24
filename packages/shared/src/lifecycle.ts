/**
 * 리포트 생명주기 상태머신 — PRD §6.4.
 * PENDING → CALCULATED → (BLOCKED) → AI_DRAFTING → DRAFT → APPROVED / REJECTED
 */
export const ReportStatus = {
  /** 업로드 완료, 계산 대기. */
  PENDING: 'PENDING',
  /** 결정론 계산·검증 완료(WARN/INFO만). CRO 확정. */
  CALCULATED: 'CALCULATED',
  /** ValidationEngine FATAL — AI 호출 차단. 사람이 데이터 수정 필요. */
  BLOCKED: 'BLOCKED',
  /** Claude 리포트 생성 중(비동기 job). */
  AI_DRAFTING: 'AI_DRAFTING',
  /** AI 리포트 Draft 생성됨. 사람 승인 전 비노출. */
  DRAFT: 'DRAFT',
  /** 사람 승인 완료. 공개·Export 가능. */
  APPROVED: 'APPROVED',
  /** 사람 반려(사유 포함). 재생성 가능. */
  REJECTED: 'REJECTED',
} as const;

export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

/** 허용된 상태 전이. 위반 시 도메인 에러. */
export const ALLOWED_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  PENDING: [ReportStatus.CALCULATED, ReportStatus.BLOCKED],
  CALCULATED: [ReportStatus.AI_DRAFTING, ReportStatus.BLOCKED],
  BLOCKED: [ReportStatus.CALCULATED], // 데이터 수정 후 재계산
  AI_DRAFTING: [ReportStatus.DRAFT, ReportStatus.CALCULATED], // 생성 실패 시 롤백
  DRAFT: [ReportStatus.APPROVED, ReportStatus.REJECTED],
  APPROVED: [], // 종착(불변). 재생성은 새 리포트로.
  REJECTED: [ReportStatus.AI_DRAFTING], // 재생성
};

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
