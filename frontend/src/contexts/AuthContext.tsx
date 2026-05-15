import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export interface User {
  id: number;
  email: string;
  createdAt: string;
  lastLogin: string | null;
  isAdmin: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, code: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  verifyCode: (code: string) => Promise<{ valid: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = '/api';

// 从 localStorage 恢复 token
function getStoredToken(): string | null {
  try {
    return localStorage.getItem('peiyangji_token');
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem('peiyangji_token', token);
    } else {
      localStorage.removeItem('peiyangji_token');
    }
  } catch {
    // localStorage 不可用
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: getStoredToken(),
    loading: true,
    error: null,
  });

  // 启动时验证 token
  useEffect(() => {
    if (!state.token) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${state.token}` },
    })
      .then(async res => {
        if (res.ok) {
          const data = await res.json();
          setState({ user: data.user, token: state.token, loading: false, error: null });
        } else {
          // token 失效
          storeToken(null);
          setState({ user: null, token: null, loading: false, error: null });
        }
      })
      .catch(() => {
        setState({ user: null, token: state.token, loading: false, error: null });
      });
  }, []);

  const clearError = useCallback(() => setState(prev => ({ ...prev, error: null })), []);

  const verifyCode = useCallback(async (code: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      return await res.json();
    } catch {
      return { valid: false, error: '网络错误，请稍后重试' };
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, error: null }));
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    const data = await res.json();
    if (!res.ok) {
      setState(prev => ({ ...prev, error: data.error || '登录失败' }));
      throw new Error(data.error || '登录失败');
    }

    storeToken(data.token);
    setState({ user: data.user, token: data.token, loading: false, error: null });
  }, []);

  const register = useCallback(async (email: string, password: string, code: string) => {
    setState(prev => ({ ...prev, error: null }));
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password, code: code.trim() }),
    });

    const data = await res.json();
    if (!res.ok) {
      setState(prev => ({ ...prev, error: data.error || '注册失败' }));
      throw new Error(data.error || '注册失败');
    }

    storeToken(data.token);
    setState({ user: data.user, token: data.token, loading: false, error: null });
  }, []);

  const logout = useCallback(() => {
    storeToken(null);
    setState({ user: null, token: null, loading: false, error: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, clearError, verifyCode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
