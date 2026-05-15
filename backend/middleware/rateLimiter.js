/**
 * 登录限流中间件
 * 同一 IP 5分钟内最多尝试 5 次
 */
const rateLimitMap = new Map();

// 定期清理过期记录（每10分钟）
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap) {
    if (now - record.startTime > 10 * 60 * 1000) {
      rateLimitMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 分钟

function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.startTime > WINDOW_MS) {
    // 新窗口
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return next();
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((record.startTime + WINDOW_MS - now) / 1000);
    return res.status(429).json({
      error: `登录尝试过于频繁，请 ${retryAfter} 秒后重试`,
      retryAfter,
    });
  }

  record.count++;
  next();
}

module.exports = loginRateLimiter;
