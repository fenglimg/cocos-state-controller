'use strict';

/**
 * csc update（P4，§5.1）：取新版净荷 vY，逐 managed 文件三方决策。
 *   指纹 == lock  → 没动过 → 直接覆盖成 vY
 *   指纹 != lock  → 本地改过 → 三方合并(base=vX pristine, ours=consumer 当前, theirs=vY)
 *                              自动并无冲突的，冲突打 <<<< 标记
 *   vY 移除的 managed 文件 → 删 consumer
 * 更新 lock.json（packageVersion=vY，files=vY pristine 指纹基线）。
 *
 * base(vX)/new(vY) 净荷由调用方提供（bin 层用 reconstructBaseline / npm pack），便于单测注入本地净荷。
 */

const fs = require('fs');
const path = require('path');
const { enumerateManagedFiles } = require('../manifest');
const { denormalizePath } = require('../normalize');
const { fingerprint } = require('../fingerprint');
const { readLock, writeLock } = require('../lock');
const { merge3 } = require('../merge3');

function readPayloadFile(payloadRoot, canonical) {
  if (!payloadRoot) return null;
  const p = path.join(payloadRoot, canonical);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function resolveNewVersion(opts, lock) {
  if (opts.newVersion) return opts.newVersion;
  try {
    return require(path.join(opts.newPayloadRoot, 'package.json')).version;
  } catch (e) {
    return lock.packageVersion;
  }
}

/**
 * @param {{ targetRoot: string, basePayloadRoot: string, newPayloadRoot: string,
 *           newVersion?: string, dryRun?: boolean }} opts
 * @returns {{ results: object, lockPath: string|null, packageVersion: string, hasConflict: boolean }}
 */
function update(opts) {
  const { targetRoot, basePayloadRoot, newPayloadRoot, dryRun = false } = opts;
  const lock = readLock(targetRoot);
  if (!lock) throw new Error('未安装：先 csc install');

  const newVersion = resolveNewVersion(opts, lock);
  const newManaged = enumerateManagedFiles(newPayloadRoot);
  const results = { clean: [], merged: [], conflict: [], added: [], removed: [] };
  const newLockFiles = {};

  for (const f of newManaged) {
    const canonical = f.canonical;
    const theirs = fs.readFileSync(f.abs, 'utf8');
    newLockFiles[canonical] = fingerprint(theirs); // lock 基线 = vY pristine
    const dest = path.join(targetRoot, denormalizePath(canonical, lock.installPaths));
    const ours = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;

    let content;
    let bucket;
    if (ours === null) {
      content = theirs;
      bucket = 'added'; // consumer 缺该文件（新文件或被删）→ 直接给 vY
    } else if (fingerprint(ours) === lock.files[canonical]) {
      content = theirs;
      bucket = 'clean'; // 没动过 → 覆盖
    } else {
      const base = readPayloadFile(basePayloadRoot, canonical) || ''; // vX pristine；缺→空基线
      const m = merge3(base, ours, theirs, { theirsLabel: `v${newVersion}` });
      content = m.content;
      bucket = m.conflict ? 'conflict' : 'merged';
    }
    results[bucket].push(canonical);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content);
    }
  }

  // vY 移除的 managed 文件 → 删 consumer
  const newSet = new Set(newManaged.map((f) => f.canonical));
  for (const canonical of Object.keys(lock.files)) {
    if (newSet.has(canonical)) continue;
    results.removed.push(canonical);
    const dest = path.join(targetRoot, denormalizePath(canonical, lock.installPaths));
    if (!dryRun && fs.existsSync(dest)) fs.unlinkSync(dest);
  }

  const newLock = { packageVersion: newVersion, installPaths: lock.installPaths, files: newLockFiles };
  const lockPath = dryRun ? null : writeLock(targetRoot, newLock);
  return { results, lockPath, packageVersion: newVersion, hasConflict: results.conflict.length > 0 };
}

module.exports = { update };
