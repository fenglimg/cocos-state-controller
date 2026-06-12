'use strict';

/**
 * 文件指纹（P1 核心数据层）。
 *
 * 指纹 = sha256(归一化后内容)（docs/cli-architecture-plan.md §3）。
 * 先归一化行尾再哈希，保证同份逻辑内容在 CRLF/LF 两端产出同一指纹——
 * 这是「指纹 == lock → 没动过」判定可靠的前提（§5.1 update）。
 */

const crypto = require('crypto');
const { normalizeContent } = require('./normalize');

/** sha256 hex of 归一化内容。 */
function fingerprint(content) {
  const normalized = normalizeContent(content);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

module.exports = { fingerprint };
