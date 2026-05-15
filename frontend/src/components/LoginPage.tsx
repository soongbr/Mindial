import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onGoRegister: () => void;
}

export default function LoginPage({ onGoRegister }: Props) {
  const { login, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    if (!email.trim() || !password) {
      setLocalError('请填写邮箱和密码');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1>🧪 培养基</h1>
          <p>知识探索，从这里开始</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <h2>登录</h2>

          {(localError || error) && (
            <div className="auth-error">{localError || error}</div>
          )}

          <div className="form-group">
            <label htmlFor="login-email">邮箱</label>
            <input
              id="login-email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">密码</label>
            <input
              id="login-password"
              type="password"
              placeholder="输入密码（至少8位）"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>

          <div className="auth-footer">
            还没有账号？{' '}
            <button type="button" className="link-btn" onClick={onGoRegister}>
              立即注册
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
