import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Role } from '@axaxax/shared';
import { useAuth } from '../context/AuthContext';

// 사이드바 + 탑바 레이아웃. 역할 인지 내비게이션(권한 없는 항목은 비활성).
interface NavDef {
  to: string;
  label: string;
  icon: string;
  /** 접근 가능한 역할(미지정 = 전체). */
  roles?: Role[];
}

const NAV: NavDef[] = [
  { to: '/', label: '홈', icon: '▤' },
  { to: '/upload', label: '업로드', icon: '⬆' },
  { to: '/cash-daily', label: '자금일보', icon: '₩' },
  { to: '/monthly-closing', label: '월결산', icon: '▦' },
  { to: '/reports', label: '리포트', icon: '◫' },
  { to: '/audit-log', label: '감사로그', icon: '☰', roles: [Role.ADMIN, Role.FINANCE_APPROVER] },
];

const ROLE_LABEL: Record<Role, string> = {
  FINANCE_STAFF: '재무담당자',
  FINANCE_APPROVER: '재무팀장',
  ADMIN: '관리자',
};

// 현재 결산 기간(데모용; 실제론 서버/컨텍스트에서 주입).
const CURRENT_PERIOD = '2026-06';

export function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = (user?.name ?? '?').slice(0, 1);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">AX</span>
          Finance AX
        </div>
        {NAV.map((item) => {
          const allowed = !item.roles || (user && item.roles.includes(user.role));
          if (!allowed) {
            return (
              <span
                key={item.to}
                className="nav-item disabled tip"
                data-tip="권한이 없는 메뉴입니다"
                aria-disabled
              >
                <span className="ico">{item.icon}</span>
                {item.label}
              </span>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="ico">{item.icon}</span>
              {item.label}
            </NavLink>
          );
        })}
        <div className="spacer" />
        <button className="new-btn" onClick={() => nav('/upload')}>
          + 새 분석
        </button>
      </aside>

      <header className="topbar">
        <div className="crumb">
          재무팀 · <strong>{CURRENT_PERIOD} 결산</strong>
        </div>
        <div className="right">
          <span className="period">기준기간 {CURRENT_PERIOD}</span>
          <div className="user-menu">
            <button className="user-chip" onClick={() => setMenuOpen((v) => !v)}>
              <span className="avatar">{initials}</span>
              <span>
                <span style={{ fontWeight: 700 }}>{user?.name}</span>
                <span className="role"> · {user ? ROLE_LABEL[user.role] : ''}</span>
              </span>
              <span aria-hidden>▾</span>
            </button>
            {menuOpen && (
              <div className="dropdown" onMouseLeave={() => setMenuOpen(false)}>
                <div className="label">{user?.email}</div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                    nav('/login');
                  }}
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
