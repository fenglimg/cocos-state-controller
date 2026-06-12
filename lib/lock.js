'use strict';

/**
 * .csc/lock.json 读写（P1 核心数据层）。
 *
 * schema（docs/cli-architecture-plan.md §3）:
 *   {
 *     packageVersion: "1.0.0",
 *     installPaths: { runtime: "assets/script/controller", panel: "packages/state-controller-v2-panel" },
 *     files: { "<canonical 相对路径>": "sha256(归一化后内容)" }
 *   }
 *
 * lock.json 是 update/上行的基线依据，必须提交 git。项目版本以 lock 为准，与全局 CLI 版本解耦。
 */

const fs = require('fs');
const path = require('path');

const CSC_DIR = '.csc';
const LOCK_FILE = 'lock.json';

/** .csc/ 目录绝对路径。 */
function cscDir(projectRoot) {
  return path.join(projectRoot, CSC_DIR);
}

/** lock.json 绝对路径。 */
function lockPath(projectRoot) {
  return path.join(cscDir(projectRoot), LOCK_FILE);
}

/** 读 lock.json；不存在返回 null（未安装）。 */
function readLock(projectRoot) {
  const p = lockPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * 写 lock.json（自动建 .csc/ 目录）。
 * 稳定序列化：2 空格缩进 + 末尾换行，避免无谓 diff。
 * @returns {string} 写入的绝对路径
 */
function writeLock(projectRoot, lock) {
  fs.mkdirSync(cscDir(projectRoot), { recursive: true });
  const p = lockPath(projectRoot);
  fs.writeFileSync(p, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  return p;
}

module.exports = { CSC_DIR, LOCK_FILE, cscDir, lockPath, readLock, writeLock };
