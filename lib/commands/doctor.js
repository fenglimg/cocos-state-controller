'use strict';

/**
 * csc doctor（P3）：体检（§10）。
 *  - 文件齐全：lock.files 每项在 consumer 存在
 *  - lock 一致：consumer 现状无 modified/removed
 *  - uuid 撞车：工程内无异文件同 uuid
 *  - Cocos 版本：在 2.4.x 支持范围
 *  - V1 cid 残留：留 P6（属迁移域，需 migrate 引擎的 cid 表）→ 标 skipped
 *
 * 每项产出 { name, status: ok|warn|fail|skipped, detail }。整体 ok ⟺ 无 fail。
 */

const fs = require('fs');
const path = require('path');
const { readLock } = require('../lock');
const { denormalizePath } = require('../normalize');
const { readCocosVersion, isSupportedCocos, scanMetaUuids } = require('../cocos');
const { diffInstalled } = require('./diff');

function doctor(targetRoot) {
  const checks = [];
  const lock = readLock(targetRoot);

  if (!lock) {
    checks.push({ name: 'lock', status: 'fail', detail: '.csc/lock.json 不存在，未安装' });
    return { ok: false, checks };
  }
  checks.push({ name: 'lock', status: 'ok', detail: `已装 v${lock.packageVersion}` });

  // 文件齐全
  const missing = Object.keys(lock.files).filter(
    (c) => !fs.existsSync(path.join(targetRoot, denormalizePath(c, lock.installPaths)))
  );
  checks.push(
    missing.length
      ? { name: 'files-present', status: 'fail', detail: `缺失 ${missing.length} 个：${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' …' : ''}` }
      : { name: 'files-present', status: 'ok', detail: `${Object.keys(lock.files).length} 个 managed 文件齐全` }
  );

  // lock 一致
  const d = diffInstalled(targetRoot);
  const drift = d.modified.length + d.removed.length;
  checks.push(
    drift
      ? { name: 'lock-consistency', status: 'warn', detail: `本地改动 modified=${d.modified.length} removed=${d.removed.length}（上行候选）` }
      : { name: 'lock-consistency', status: 'ok', detail: '与 lock 一致，无本地漂移' }
  );

  // uuid 撞车（工程内异文件同 uuid）
  const uuidMap = scanMetaUuids(targetRoot);
  const clashes = Object.entries(uuidMap).filter(([, files]) => files.length > 1);
  checks.push(
    clashes.length
      ? { name: 'uuid-collision', status: 'fail', detail: `${clashes.length} 个 uuid 撞车，如 ${clashes[0][0]} → ${clashes[0][1].join(' / ')}` }
      : { name: 'uuid-collision', status: 'ok', detail: '无 uuid 撞车' }
  );

  // Cocos 版本
  const cocos = readCocosVersion(targetRoot);
  if (!cocos) {
    checks.push({ name: 'cocos-version', status: 'warn', detail: '未探测到 Cocos 版本（project.json）' });
  } else if (isSupportedCocos(cocos.version)) {
    checks.push({ name: 'cocos-version', status: 'ok', detail: `Cocos ${cocos.version}（${cocos.source}）` });
  } else {
    checks.push({ name: 'cocos-version', status: 'warn', detail: `Cocos ${cocos.version} 不在 2.4.x 支持范围` });
  }

  // V1 cid 残留 —— 迁移域，留 P6
  checks.push({ name: 'v1-cid-residue', status: 'skipped', detail: '留 P6（依赖 migrate 引擎 cid 表）' });

  return { ok: !checks.some((c) => c.status === 'fail'), checks };
}

module.exports = { doctor };
