import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Role } from '@axaxax/shared';
import { useAuth } from '../context/AuthContext';

// 사이드바 + 탑바 레이아웃 (design/Chrome 기준). 역할 인지 내비.
interface NavDef {
  to: string;
  label: string;
  title: string;
  icon: ReactNode;
  roles?: Role[];
}

const I = {
  home: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
  upload: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </svg>
  ),
  cash: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <circle cx="12" cy="12.5" r="2.4" />
    </svg>
  ),
  closing: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  payroll: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  report: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v6h6" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  ),
  audit: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  ),
  intel: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 17l5-5 4 4 8-9" />
      <path d="M21 7v5h-5" />
    </svg>
  ),
};

const NAV: NavDef[] = [
  { to: '/', label: '홈', title: '홈', icon: I.home },
  { to: '/upload', label: '업로드', title: '업로드', icon: I.upload },
  { to: '/cash-daily', label: '자금일보', title: '자금일보', icon: I.cash },
  { to: '/monthly-closing', label: '월결산', title: '월결산', icon: I.closing },
  { to: '/payroll', label: '급여', title: '급여', icon: I.payroll },
  { to: '/market-intel', label: '시장정보', title: '시장·경쟁 인텔리전스', icon: I.intel },
  { to: '/reports', label: '리포트', title: '리포트', icon: I.report },
  {
    to: '/audit-log',
    label: '감사로그',
    title: '감사로그',
    icon: I.audit,
    roles: [Role.ADMIN, Role.FINANCE_APPROVER],
  },
];

const ROLE_LABEL: Record<Role, string> = {
  FINANCE_STAFF: '재무담당자',
  FINANCE_APPROVER: '재무팀장',
  ADMIN: '관리자',
};

const CURRENT_PERIOD = '2026.06';

export function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = (user?.name ?? '?').slice(0, 1);
  const active =
    NAV.slice()
      .sort((a, b) => b.to.length - a.to.length)
      .find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to))) ?? NAV[0];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">F</span>
          Finance AX
        </div>
        <nav className="nav">
          {NAV.map((item) => {
            const allowed = !item.roles || (user && item.roles.includes(user.role));
            if (!allowed) {
              return (
                <span
                  key={item.to}
                  className="nav-item disabled tip"
                  data-tip="권한이 없는 메뉴입니다 (재무팀장·관리자 전용)"
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
        </nav>
        <div className="spacer" />
        <div className="sidebar-foot">
          <div className="live">
            <span className="pip" />
            백엔드 연결됨
          </div>
          <div style={{ marginTop: 3, color: '#46536a' }}>자동 검증 엔진 v1.0</div>
        </div>
      </aside>

      <header className="topbar">
        <div className="title-wrap">
          <h1>{active.title}</h1>
          <span className="subtitle">재무팀 · {CURRENT_PERIOD} 결산</span>
        </div>
        <div className="right">
          <button className="period-chip" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4" />
            </svg>
            <span className="tnum">{CURRENT_PERIOD}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <div className="divider-v" />
          <div className="user-menu">
            <button className="user-chip" onClick={() => setMenuOpen((v) => !v)}>
              <span className="avatar">{initials}</span>
              <span>
                <span className="uname">{user?.name}</span>
                <br />
                <span className="role">{user ? ROLE_LABEL[user.role] : ''}</span>
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b99ad" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
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
