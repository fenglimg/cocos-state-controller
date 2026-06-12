'use strict';

/**
 * csc diff（P3）：consumer 当前 managed 文件 vs 装的版本 pristine（归一化后）
 * 列 新增/删除/修改（§10）。
 *
 * 基线 = lock.files 里记录的安装时指纹；当前 = 重算 consumer 现状指纹。
 * 指纹基于归一化内容，故行尾/平台差异不误报。
 */

const fs = require('fs');
const path = require('path');
const { readLock } = require('../lock');
const { denormalizePath } = require('../normalize');
const { fingerprint } = require('../fingerprint');
const { diffManifests } = require('../diff');

/**
 * @returns {{ added: string[], removed: string[], modified: string[] }}
 *   key 为 canonical 路径。removed = lock 有但 consumer 文件已删。
 */
function diffInstalled(targetRoot) {
  const lock = readLock(targetRoot);
  if (!lock) throw new Error('未安装：.csc/lock.json 不存在，先跑 csc install');

  const current = {};
  for (const canonical of Object.keys(lock.files)) {
    const full = path.join(targetRoot, denormalizePath(canonical, lock.installPaths));
    if (fs.existsSync(full)) current[canonical] = fingerprint(fs.readFileSync(full));
    // 不存在 → 不入 current → diffManifests 归为 removed
  }
  return diffManifests(lock.files, current);
}

module.exports = { diffInstalled };
