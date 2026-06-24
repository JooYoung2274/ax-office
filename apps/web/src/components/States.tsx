import type { ReactNode } from 'react';
import { isAxiosError } from 'axios';

// 공통 빈/로딩/에러 상태 — 백엔드 미구동 시에도 "데이터 없음"으로 우아하게 표시(§2.5).

export function LoadingState({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="skeleton" style={{ width: '60%', height: 14 }} />
      <div className="skeleton" style={{ width: '40%', height: 14 }} />
      <p className="muted">{label}</p>
    </div>
  );
}

export function EmptyState({
  emoji = '📭',
  title = '아직 데이터가 없습니다',
  description,
  actions,
}: {
  emoji?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="emoji">{emoji}</div>
      <div className="s-title">{title}</div>
      {description && <p className="muted">{description}</p>}
      {actions && <div className="s-actions">{actions}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  // 백엔드 연결 실패(네트워크)는 "데이터 없음"으로 부드럽게 안내.
  const offline =
    isAxiosError(error) && (!error.response || error.code === 'ERR_NETWORK');
  return (
    <div className="state">
      <div className="emoji">{offline ? '🔌' : '⚠️'}</div>
      <div className="s-title">
        {offline ? '백엔드에 연결할 수 없습니다' : '데이터를 불러오지 못했습니다'}
      </div>
      <p className="muted">
        {offline
          ? 'API 서버가 실행 중인지 확인하세요. (현재는 데이터 없음 상태로 표시됩니다)'
          : isAxiosError(error)
            ? error.response?.statusText ?? error.message
            : '알 수 없는 오류'}
      </p>
      {onRetry && (
        <div className="s-actions">
          <button className="btn btn-sm" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
