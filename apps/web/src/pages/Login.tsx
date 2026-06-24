import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useAuth } from '../context/AuthContext';

// 로그인 — JWT 발급은 백엔드 /auth/login. 토큰은 localStorage에 저장.
export function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string })?.from ?? '/';

  const [email, setEmail] = useState('staff@axaxax.dev');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    nav(from, { replace: true });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      nav(from, { replace: true });
    } catch (e) {
      if (isAxiosError(e) && (!e.response || e.code === 'ERR_NETWORK')) {
        setErr('백엔드에 연결할 수 없습니다. API 서버 구동을 확인하세요.');
      } else if (isAxiosError(e) && e.response?.status === 401) {
        setErr('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else {
        setErr('로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      {/* ── Brand panel ──────────────────────────────────── */}
      <div className="login-brand">
        <div className="logo-row">
          <div className="logo">F</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#f2f5fa', letterSpacing: '-0.3px' }}>
            Finance AX
          </div>
        </div>

        <div style={{ marginTop: 'auto', maxWidth: 420 }}>
          <h2>
            계산은 코드가,
            <br />
            해석은 AI가,
            <br />
            결정은 사람이.
          </h2>
          <p className="lead">
            단순 계산과 검증은 자동화된 코드가 100% 책임집니다. AI는 근거를 인용한 보조
            리포트만 제공하며, 최종 승인은 언제나 담당자의 몫입니다.
          </p>

          <div
            style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 13 }}
          >
            <div className="login-tier">
              <span
                className="n"
                style={{ background: 'rgba(99,102,241,0.16)', color: '#a6abf2' }}
              >
                1
              </span>
              자동 수치 검증 (차대 일치·잔액)
            </div>
            <div className="login-tier">
              <span
                className="n"
                style={{ background: 'rgba(139,123,180,0.18)', color: '#c6bce0' }}
              >
                2
              </span>
              근거 추적이 가능한 AI 분석 리포트
            </div>
            <div className="login-tier">
              <span
                className="n"
                style={{ background: 'rgba(34,197,94,0.16)', color: '#7fdca0' }}
              >
                3
              </span>
              책임이 명확한 사람의 승인
            </div>
          </div>
        </div>

        <div
          style={{ marginTop: 'auto', paddingTop: 40, fontSize: 11.5, color: '#56627a' }}
        >
          금융 데이터는 암호화되어 저장됩니다 · ISO 27001
        </div>
      </div>

      {/* ── Form panel ───────────────────────────────────── */}
      <div className="login-form-wrap">
        <form className="login-form" onSubmit={onSubmit}>
          <h1>로그인</h1>
          <p style={{ margin: '7px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            등록된 회사 계정으로 접속하세요.
          </p>

          {err && (
            <div
              role="alert"
              style={{
                marginTop: 20,
                padding: '10px 13px',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                borderRadius: 'var(--radius)',
                fontSize: 12.5,
                color: 'var(--danger-text)',
              }}
            >
              {err}
            </div>
          )}

          <div
            style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 15 }}
          >
            <div className="field">
              <label htmlFor="email">이메일</label>
              <input
                id="email"
                type="email"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="pw">비밀번호</label>
              <input
                id="pw"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12.5,
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  defaultChecked
                  style={{ width: 15, height: 15, accentColor: 'var(--indigo)' }}
                />
                로그인 상태 유지
              </label>
              <a
                href="#"
                style={{ fontSize: 12.5, color: 'var(--indigo)', fontWeight: 600 }}
              >
                비밀번호 찾기
              </a>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              style={{ marginTop: 4 }}
              disabled={busy}
            >
              {busy ? '로그인 중…' : '로그인'}
            </button>
          </div>

          <div
            style={{
              marginTop: 24,
              paddingTop: 18,
              borderTop: '1px solid var(--border-soft)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 11.5,
              color: 'var(--faint)',
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#22a35a"
              strokeWidth="2"
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            SSO·2단계 인증을 지원합니다. 계정 문의는 관리자에게.
          </div>

          <p
            style={{
              marginTop: 12,
              fontSize: 11,
              color: 'var(--faint)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            개발 시드 계정: staff@axaxax.dev / staff1234
          </p>
        </form>
      </div>
    </div>
  );
}
