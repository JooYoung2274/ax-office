import type { ReportStatus } from '@axaxax/shared';

// ReportStatus(내부 코드) → 현업 친화 한국어 라벨 + 색. (코드 enum 값은 유지, 화면 라벨만 한글)
const MAP: Record<ReportStatus, { label: string; cls: string; pulse?: boolean }> = {
  PENDING: { label: '대기 중', cls: 'badge-pending' },
  CALCULATED: { label: '계산 완료', cls: 'badge-calc' },
  BLOCKED: { label: '검증 실패', cls: 'badge-blocked' },
  AI_DRAFTING: { label: 'AI 분석 중', cls: 'badge-drafting', pulse: true },
  DRAFT: { label: '초안 (미승인)', cls: 'badge-draft' },
  APPROVED: { label: '승인됨', cls: 'badge-approved' },
  REJECTED: { label: '반려됨', cls: 'badge-rejected' },
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

/** 코드 계산값임을 표시하는 배지(AI 생성 아님). */
export function CalcBadge({ label = '자동 계산값' }: { label?: string }) {
  return (
    <span className="cro-chip" title="코드가 자동으로 계산·검증한 값입니다 (AI가 만든 값이 아닙니다)">
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
      원본 변경됨 · 재계산 필요
    </span>
  );
}
