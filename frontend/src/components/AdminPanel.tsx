import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface UserRow {
  id: number;
  email: string;
  last_login: string | null;
  created_at: string;
}

interface CodeRow {
  code: string;
  used: number;
  used_by: number | null;
  used_by_email: string | null;
  created_at: string;
  expired: boolean;
}

interface Props {
  apiBase: string;
  onClose: () => void;
}

export default function AdminPanel({ apiBase, onClose }: Props) {
  const { token } = useAuth();
  const [tab, setTab] = useState<'users' | 'codes'>('users');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // 生成邀请码
  const [genCount, setGenCount] = useState(1);
  const [genLoading, setGenLoading] = useState(false);

  // 重置密码弹窗
  const [resetModal, setResetModal] = useState<{ userId: number; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/admin/users`, { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
      } else {
        setError(data.error || '获取用户列表失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/admin/codes`, { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setCodes(data.codes);
      } else {
        setError(data.error || '获取邀请码列表失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === 'users') fetchUsers();
    else fetchCodes();
  }, [tab, fetchUsers, fetchCodes]);

  const handleDeleteUser = async (userId: number, email: string) => {
    if (!confirm(`确定要删除用户 ${email} 吗？此操作不可撤销。\n\n该用户的知识库数据也会被一并删除。`)) return;

    setError('');
    setMessage('');
    try {
      const res = await fetch(`${apiBase}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        fetchUsers();
      } else {
        setError(data.error || '删除失败');
      }
    } catch {
      setError('网络错误');
    }
  };

  const handleResetPassword = async () => {
    if (!resetModal) return;
    if (newPassword.length < 8) {
      setError('新密码至少需要8位');
      return;
    }

    setResetLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/admin/users/${resetModal.userId}/password`, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        setResetModal(null);
        setNewPassword('');
      } else {
        setError(data.error || '重置失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setResetLoading(false);
    }
  };

  const handleGenerateCodes = async () => {
    setGenLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`${apiBase}/admin/codes`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: genCount }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        fetchCodes();
      } else {
        setError(data.error || '生成失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setGenLoading(false);
    }
  };

  const handleDeleteCode = async (code: string) => {
    if (!confirm(`确定要作废邀请码 ${code} 吗？`)) return;

    setError('');
    setMessage('');
    try {
      const res = await fetch(`${apiBase}/admin/codes/${code}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        fetchCodes();
      } else {
        setError(data.error || '作废失败');
      }
    } catch {
      setError('网络错误');
    }
  };

  const formatTime = (t: string | null) => {
    if (!t) return '-';
    try {
      return new Date(t + (t.endsWith('Z') ? '' : 'Z')).toLocaleString('zh-CN');
    } catch {
      return t;
    }
  };

  return (
    <div className="admin-overlay">
      <div className="admin-panel">
        <div className="admin-header">
          <h2>⚙️ 管理后台</h2>
          <button className="admin-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${tab === 'users' ? 'active' : ''}`}
            onClick={() => setTab('users')}
          >
            👥 用户管理
          </button>
          <button
            className={`admin-tab ${tab === 'codes' ? 'active' : ''}`}
            onClick={() => setTab('codes')}
          >
            🎫 邀请码管理
          </button>
        </div>

        {error && <div className="auth-error" style={{ margin: '0 24px 12px' }}>{error}</div>}
        {message && <div className="auth-success" style={{ margin: '0 24px 12px' }}>{message}</div>}

        <div className="admin-content">
          {tab === 'users' ? (
            <>
              {loading ? (
                <div className="admin-loading">加载中...</div>
              ) : users.length === 0 ? (
                <div className="admin-empty">暂无用户</div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>邮箱</th>
                      <th>注册时间</th>
                      <th>最后登录</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td>{u.email}</td>
                        <td>{formatTime(u.created_at)}</td>
                        <td>{formatTime(u.last_login)}</td>
                        <td className="admin-actions">
                          <button
                            className="admin-action-btn"
                            onClick={() => setResetModal({ userId: u.id, email: u.email })}
                          >
                            🔑
                          </button>
                          <button
                            className="admin-action-btn danger"
                            onClick={() => handleDeleteUser(u.id, u.email)}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <>
              <div className="admin-code-gen">
                <label>生成邀请码：</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={genCount}
                  onChange={e => setGenCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                  style={{ width: '60px', textAlign: 'center' }}
                />
                <button className="auth-btn" onClick={handleGenerateCodes} disabled={genLoading} style={{ marginLeft: '8px', padding: '6px 16px' }}>
                  {genLoading ? '生成中...' : '生成'}
                </button>
              </div>

              {loading ? (
                <div className="admin-loading">加载中...</div>
              ) : codes.length === 0 ? (
                <div className="admin-empty">暂无邀请码</div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>邀请码</th>
                      <th>状态</th>
                      <th>使用者</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map(c => (
                      <tr key={c.code}>
                        <td className="admin-code">{c.code}</td>
                        <td>
                          {c.used ? (
                            <span className="badge used">已使用</span>
                          ) : c.expired ? (
                            <span className="badge expired">已过期</span>
                          ) : (
                            <span className="badge available">可用</span>
                          )}
                        </td>
                        <td>{c.used_by_email || '-'}</td>
                        <td>{formatTime(c.created_at)}</td>
                        <td className="admin-actions">
                          {!c.used && (
                            <button
                              className="admin-action-btn danger"
                              onClick={() => handleDeleteCode(c.code)}
                            >
                              🗑️
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {/* 重置密码弹窗 */}
      {resetModal && (
        <div className="modal-overlay" onClick={() => setResetModal(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>重置密码</h3>
            <p>用户：{resetModal.email}</p>
            <div className="form-group">
              <label>新密码（至少8位）</label>
              <input
                type="text"
                placeholder="输入新密码"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="auth-btn" onClick={handleResetPassword} disabled={resetLoading}>
                {resetLoading ? '重置中...' : '确认重置'}
              </button>
              <button className="link-btn" onClick={() => setResetModal(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
