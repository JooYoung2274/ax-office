import type { ReportStatus } from '@axaxax/shared';

// ReportStatus → 한국어 라벨 + 색 (design/DesignSystem 상태머신 배지).
const MAP: Record<ReportStatus, { label: string; cls: string; pulse?: boolean }> = {
  PENDING: { label: 'PENDING · 대기', cls: 'badge-pending' },
  CALCULATED: { label: 'CALCULATED · 계산완료', cls: 'badge-calc' },
  BLOCKED: { label: 'BLOCKED · 검증차단', cls: 'badge-blocked' },
  AI_DRAFTING: { label: 'AI_DRAFTING · 작성중', cls: 'badge-drafting', pulse: true },
  DRAFT: { label: 'DRAFT · 초안', cls: 'badge-draft' },
  APPROVED: { label: 'APPROVED · 승인됨', cls: 'badge-approved' },
  REJECTED: { label: 'REJECTED · 반려됨', cls: 'badge-rejected' },
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  const m = MAP[status] ?? { label: status, cls: 'badge-pending' };
  return (
    <span className={`badge ${m.cls}`}>
      <span className="dot" />
      {m.label}
    </span>
  );
}

/** 결정론 계산값임을 표시하는 배지(AI 생성 아님). */
export function CalcBadge({ label = 'CRO 검증' }: { label?: string }) {
  return (
    <span className="cro-chip" title="결정론 엔진이 산출·검증한 계산값입니다 (AI 생성 아님)">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      {label}
    </span>
  );
}

/** 원본 데이터 변경으로 재생성이 필요한 Stale 배지(§1.1 / §2.4). */
export function StaleBadge({ blinking = true }: { blinking?: boolean }) {
  return (
    <span
      className={`badge badge-stale${blinking ? ' blinking' : ''}`}
      title="원본 데이터가 변경되었습니다. 리포트를 재생성하세요."
    >
      <span className="dot" />
      Stale · 재생성 필요
    </span>
  );
}
