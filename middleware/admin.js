/**
 * 管理员权限中间件
 * 管理员 UID 从环境变量 ADMIN_UID 读取
 * 必须先通过 authMiddleware 认证
 */
function adminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '请先登录' });
  }

  const adminUid = process.env.ADMIN_UID;
  if (!adminUid) {
    console.warn('⚠️ ADMIN_UID 未设置，所有用户均可访问管理接口');
    // 如果没配置 ADMIN_UID，默认第一个用户是管理员（id=1）
    if (req.user.id === 1) {
      req.user.isAdmin = true;
      return next();
    }
    return res.status(403).json({ error: '无权访问管理功能' });
  }

  // 支持多个管理员，逗号分隔
  const adminIds = adminUid.split(',').map(id => parseInt(id.trim(), 10));
  if (adminIds.includes(req.user.id)) {
    req.user.isAdmin = true;
    return next();
  }

  return res.status(403).json({ error: '无权访问管理功能' });
}

module.exports = adminMiddleware;
