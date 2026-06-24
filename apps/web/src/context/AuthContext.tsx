import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Role, APPROVER_ROLES } from '@axaxax/shared';
import type { AuthUser } from '../lib/types';
import { login as apiLogin, getMe, tokenStore } from '../lib/api';

// 현재 사용자 + 역할 + 토큰을 관리. 액션 권한 판정은 RoleGate가 이 컨텍스트를 읽는다.
interface AuthState {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  isApprover: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const USER_KEY = 'axaxax.user';
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });
  const [ready, setReady] = useState(false);

  // 앱 로드 시 1회 세션 검증. stale/만료 토큰을 조용히 방치하지 않고
  // /auth/me로 확인한다. 401이면 인터셉터가 로그인으로 보내고 여기서 정리한다.
  // (이게 없으면 "대시보드는 404로 보이고 업로드만 401로 튕기는" 혼란이 생긴다.)
  useEffect(() => {
    let alive = true;
    const t = tokenStore.get();
    if (!t) {
      if (localStorage.getItem(USER_KEY)) localStorage.removeItem(USER_KEY);
      setReady(true);
      return;
    }
    getMe()
      .then((me) => {
        if (!alive) return;
        localStorage.setItem(USER_KEY, JSON.stringify(me));
        setUser(me);
      })
      .catch(() => {
        if (!alive) return;
        // 무효 토큰 정리(인터셉터가 /login으로 이동시킴).
        tokenStore.clear();
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
    // 최초 마운트 1회만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    const res = await apiLogin(email, password);
    tokenStore.set(res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
  }

  function logout() {
    tokenStore.clear();
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      ready,
      isApprover: user ? APPROVER_ROLES.includes(user.role) : false,
      isAdmin: user?.role === Role.ADMIN,
      login,
      logout,
    }),
    [user, token, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
