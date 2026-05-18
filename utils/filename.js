/**
 * 文件名编码修复工具
 * 处理 multer 上传时可能出现的编码错误（mojibake、URL编码、GB/GBK误判）
 */

/**
 * 修复文件名编码问题
 * 策略：检测是否已有有效中文 → 尝试 URL 解码 → 尝试 Latin-1→UTF-8 → 保持原样
 * @param {string} filename - 原始文件名
 * @returns {string} - 修复后的文件名
 */
function fixFileNameEncoding(filename) {
  if (!filename) return filename;

  // 0. 如果已经包含有效 CJK 字符，直接返回
  if (/[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}]/u.test(filename)) {
    return filename;
  }

  // 1. 尝试 URL 解码 (%XX 序列)
  if (filename.includes('%')) {
    try {
      const decoded = decodeURIComponent(filename);
      if (decoded && !decoded.includes('\uFFFD') && /[\u4e00-\u9fff]/.test(decoded)) {
        return decoded;
      }
    } catch (e) {
      // URL 解码失败，继续
    }
  }

  // 2. 尝试 Latin-1 → UTF-8（修复最常见的双编码问题）
  //    这是最核心的修复：文件名以 UTF-8 字节传输但被当作 Latin-1 解析
  try {
    const decoded = Buffer.from(filename, 'latin1').toString('utf8');
    // 验证结果：含有有效中文且无替换字符
    if (/[\u4e00-\u9fff]/.test(decoded) && !decoded.includes('\uFFFD')) {
      return decoded;
    }
  } catch (e) {
    // 忽略
  }

  // 3. 包含替换字符 → 肯定有编码问题，强制 Latin-1 → UTF-8
  if (filename.includes('\uFFFD')) {
    try {
      const decoded = Buffer.from(filename, 'latin1').toString('utf8');
      return decoded;
    } catch (e) {
      // 忽略
    }
  }

  // 4. 包含明显 mojibake 特征字符（拉丁重音字符通常表示双编码）
  const mojibakePattern = /[éèêëàâùûüïîôöÿÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞß]/;
  if (mojibakePattern.test(filename)) {
    try {
      const decoded = Buffer.from(filename, 'latin1').toString('utf8');
      if (!decoded.includes('\uFFFD')) {
        return decoded;
      }
    } catch (e) {
      // 忽略
    }
  }

  return filename;
}

module.exports = { fixFileNameEncoding };
