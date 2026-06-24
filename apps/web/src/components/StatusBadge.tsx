import type { ReportStatus } from '@axaxax/shared';

// ReportStatus → 한국어 라벨 + 색(§2.4 / §6.4 매핑).
const MAP: Record<ReportStatus, { label: string; cls: string }> = {
  PENDING: { label: '계산 대기', cls: 'badge-pending' },
  CALCULATED: { label: '계산값 🔒', cls: 'badge-calc' },
  BLOCKED: { label: '검증 실패', cls: 'badge-rejected' },
  AI_DRAFTING: { label: '리포트 생성 중', cls: 'badge-drafting' },
  DRAFT: { label: 'DRAFT · 미승인', cls: 'badge-draft' },
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

/** 결정론 계산값임을 표시하는 배지(AI 생성 아님). */
export function CalcBadge() {
  return (
    <span className="badge badge-calc" title="결정론 엔진이 산출한 계산값입니다 (AI 생성 아님)">
      <span className="dot" />
      계산값 🔒
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
      원본변경 · 재생성 필요
    </span>
  );
}
