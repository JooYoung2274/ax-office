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
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="row" style={{ marginBottom: 18 }}>
          <span
            className="logo"
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: 'linear-gradient(135deg,#1f3a8a,#5b8def)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 800,
            }}
          >
            AX
          </span>
          <div>
            <h1>Finance AX</h1>
            <div className="muted" style={{ fontSize: 12 }}>
              재무 AX 전환 · 계산 → AI → 승인
            </div>
          </div>
        </div>

        {err && <div className="form-err">{err}</div>}

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

        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? '로그인 중…' : '로그인'}
        </button>

        <p className="dim" style={{ fontSize: 11.5, marginTop: 16, textAlign: 'center' }}>
          모든 AI(Claude) 호출은 백엔드를 경유합니다. 프론트엔드는 API 키를 보유하지 않습니다.
        </p>
      </form>
    </div>
  );
}
