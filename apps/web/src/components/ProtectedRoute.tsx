import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@axaxax/shared';
import { useAuth } from '../context/AuthContext';

// 미인증 시 /login으로. roles 지정 시 해당 역할만 라우트 접근 허용(없으면 403 안내).
export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="state">
        <div className="emoji">🔒</div>
        <div className="s-title">접근 권한이 없습니다</div>
        <p className="muted">이 화면은 지정된 역할만 열람할 수 있습니다.</p>
      </div>
    );
  }
  return <>{children}</>;
}
