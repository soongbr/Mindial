import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onGoLogin: () => void;
}

export default function RegisterPage({ onGoLogin }: Props) {
  const { register, verifyCode, error, clearError } = useAuth();
  const [step, setStep] = useState<'code' | 'form'>('code');
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [codeError, setCodeError] = useState('');

  // 校验邀请码
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError('');
    clearError();

    if (!inviteCode.trim()) {
      setCodeError('请输入邀请码');
      return;
    }

    if (inviteCode.trim().length !== 6) {
      setCodeError('邀请码为6位字母数字');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyCode(inviteCode);
      if (result.valid) {
        setStep('form');
        setLocalError('');
      } else {
        setCodeError(result.error || '邀请码无效');
      }
    } catch {
      setCodeError('验证失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 提交注册
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    if (!email.trim()) {
      setLocalError('请输入邮箱');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setLocalError('邮箱格式不正确');
      return;
    }

    if (password.length < 8) {
      setLocalError('密码至少需要8位字符');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('两次密码输入不一致');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, inviteCode);
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1>🧪 培养基</h1>
          <p>内测用户注册</p>
        </div>

        {step === 'code' ? (
          // 步骤1：输入邀请码
          <form onSubmit={handleVerifyCode} className="auth-form">
            <h2>验证邀请码</h2>

            {codeError && <div className="auth-error">{codeError}</div>}
            {error && <div className="auth-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="invite-code">邀请码</label>
              <input
                id="invite-code"
                type="text"
                placeholder="输入6位邀请码，如 ABC123"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoFocus
                disabled={loading}
                style={{ textTransform: 'uppercase', letterSpacing: '4px', textAlign: 'center' }}
              />
            </div>

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? '验证中...' : '下一步'}
            </button>

            <div className="auth-footer">
              已有账号？{' '}
              <button type="button" className="link-btn" onClick={onGoLogin}>
                去登录
              </button>
            </div>
          </form>
        ) : (
          // 步骤2：填写注册信息
          <form onSubmit={handleRegister} className="auth-form">
            <h2>创建账号</h2>

            {(localError || error) && (
              <div className="auth-error">{localError || error}</div>
            )}

            <div className="form-group">
              <label>邀请码（已验证 ✅）</label>
              <input
                type="text"
                value={inviteCode}
                disabled
                style={{ background: '#f0fdf4', color: '#166534', fontWeight: 600 }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-email">邮箱</label>
              <input
                id="reg-email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-password">密码</label>
              <input
                id="reg-password"
                type="password"
                placeholder="至少8位字符"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-confirm">确认密码</label>
              <input
                id="reg-confirm"
                type="password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? '注册中...' : '注册并登录'}
            </button>

            <div className="auth-footer">
              <button type="button" className="link-btn" onClick={() => setStep('code')}>
                ← 更换邀请码
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
