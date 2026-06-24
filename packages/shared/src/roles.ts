/**
 * RBAC 역할 — PRD §2.1 / §6.5.
 * MVP는 단일 테넌트를 가정하되 승인 워크플로·감사 무결성을 위해 역할을 코드 레벨에서 분리한다.
 */
export const Role = {
  /** 재무담당자: 업로드·계산·리포트 생성(Draft). 자기 리포트 승인 불가. */
  FINANCE_STAFF: 'FINANCE_STAFF',
  /** 재무팀장: 리포트 승인/반려, 승인된 리포트 Export. */
  FINANCE_APPROVER: 'FINANCE_APPROVER',
  /** 관리자: 임계값/보존정책 설정, 감사 로그 전체 조회(수정·삭제 불가). */
  ADMIN: 'ADMIN',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: Role[] = [Role.FINANCE_STAFF, Role.FINANCE_APPROVER, Role.ADMIN];

/** 승인 권한 보유 역할. */
export const APPROVER_ROLES: Role[] = [Role.FINANCE_APPROVER, Role.ADMIN];
