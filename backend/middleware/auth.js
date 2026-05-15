const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'peiyangji-dev-secret-change-in-production';

/**
 * JWT 认证中间件
 * 从 Authorization header 中提取 Bearer token 并验证
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }
    return res.status(401).json({ error: '无效的登录凭证' });
  }
}

/**
 * 生成 JWT Token
 * @param {object} user - { id, email }
 * @returns {string} JWT token (有效期30天)
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { authMiddleware, generateToken, JWT_SECRET };
