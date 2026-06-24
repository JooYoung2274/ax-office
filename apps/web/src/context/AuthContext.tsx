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
import { login as apiLogin, tokenStore } from '../lib/api';

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
  const [ready, setReady] = useState(true);

  useEffect(() => {
    // 토큰은 있으나 사용자 정보가 없는 비정상 상태 정리.
    if (token && !user) {
      tokenStore.clear();
      setToken(null);
    }
    setReady(true);
  }, [token, user]);

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
