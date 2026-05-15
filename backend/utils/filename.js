/**
 * 文件名编码修复工具
 * 处理 multer 上传时可能出现的编码错误（mojibake、URL编码、GB/GBK误判）
 */

/**
 * 修复文件名编码问题
 * @param {string} filename - 原始文件名
 * @returns {string} - 修复后的文件名
 */
function fixFileNameEncoding(filename) {
  if (!filename) return filename;

  try {
    // 1. 如果文件名包含 %XX 序列，尝试 URL 解码
    if (filename.includes('%')) {
      try {
        const decoded = decodeURIComponent(filename);
        // 验证解码后是否为有效 UTF-8（不包含替换字符）
        if (decoded && !decoded.includes('\uFFFD')) {
          return decoded;
        }
      } catch (e) {
        // URL 解码失败，继续尝试其他方式
      }
    }

    // 2. 检测 mojibake（Latin-1 被误当 UTF-8）
    const mojibakeIndicators = ['é', 'è', 'ê', 'ë', 'à', 'â', 'ù', 'û', 'ü', 'ï', 'î', 'ô', 'ÿ'];
    const hasMojibake = mojibakeIndicators.some(char => filename.includes(char));

    if (hasMojibake) {
      const fixed = Buffer.from(filename, 'latin1').toString('utf8');
      if (fixed && !fixed.includes('\uFFFD')) {
        return fixed;
      }
    }

    // 3. 检测纯 ASCII 范围但包含 GB/GBK 编码（可能有中文）
    if (/^[\x00-\xFF]+$/.test(filename) && filename.length > 10) {
      try {
        const decoded = Buffer.from(filename, 'latin1').toString('utf8');
        if (/[\u4e00-\u9fa5]/.test(decoded)) {
          return decoded;
        }
      } catch (e) {
        // 忽略
      }
    }

    // 4. 已经包含无效替换字符，尝试 Latin-1 → UTF-8
    if (filename.includes('\uFFFD')) {
      const fixed = Buffer.from(filename, 'latin1').toString('utf8');
      return fixed;
    }

    return filename;
  } catch (e) {
    return filename;
  }
}

module.exports = { fixFileNameEncoding };
