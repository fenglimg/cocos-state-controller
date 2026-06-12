'use strict';

/**
 * csc install（P3）：拷净荷 runtime+panel → 写 canonical .meta → 写 .csc/lock.json
 * + uuid 撞车预检（§6）+ Cocos 版本 warn（§7）。
 *
 * 纯逻辑函数 install()：做副作用（拷文件 / 写 lock）并返回结构化结果，由 bin 层负责打印与提示重启。
 * uuid 撞车在拷贝前预检：异文件占用包的 canonical uuid → 中止报红，绝不动包的 uuid（§6）。
 */

const fs = require('fs');
const path = require('path');
const { enumerateManagedFiles, readManifest } = require('../manifest');
const { denormalizePath, CANONICAL } = require('../normalize');
const { fingerprint } = require('../fingerprint');
const { writeLock } = require('../lock');
const { readCocosVersion, isSupportedCocos, scanMetaUuids } = require('../cocos');

const DEFAULT_INSTALL_PATHS = Object.freeze({
  runtime: CANONICAL.runtime,
  panel: CANONICAL.panel,
});

/** 预检：包 canonical uuid 是否被 consumer 的异文件占用。返回撞车列表（空=放行）。 */
function detectUuidCollisions(managedFiles, targetRoot, installPaths) {
  const payloadUuids = {}; // uuid → 安装目标路径
  for (const f of managedFiles) {
    if (!f.canonical.endsWith('.meta')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(f.abs, 'utf8'));
      if (j.uuid) payloadUuids[j.uuid] = denormalizePath(f.canonical, installPaths);
    } catch (e) {
      /* 坏 meta 由 doctor 另报 */
    }
  }
  const consumerUuids = scanMetaUuids(targetRoot);
  const collisions = [];
  for (const [uuid, dest] of Object.entries(payloadUuids)) {
    const foreign = (consumerUuids[uuid] || []).filter((p) => p !== dest);
    if (foreign.length) collisions.push({ uuid, packageDest: dest, consumerFiles: foreign });
  }
  return collisions;
}

/**
 * @param {{ payloadRoot: string, targetRoot: string, installPaths?: object,
 *           packageVersion: string, dryRun?: boolean }} opts
 * @returns {{ copied: string[], lockPath: string|null, collisions: object[],
 *             cocos: object|null, cocosSupported: boolean }}
 */
function install(opts) {
  const { payloadRoot, targetRoot, packageVersion, dryRun = false } = opts;
  const installPaths = opts.installPaths || DEFAULT_INSTALL_PATHS;

  const manifest = readManifest(payloadRoot);
  const managed = enumerateManagedFiles(payloadRoot, manifest);

  // 1) uuid 撞车预检 —— 撞则中止，不拷不写。
  const collisions = detectUuidCollisions(managed, targetRoot, installPaths);
  if (collisions.length) {
    return { copied: [], lockPath: null, collisions, cocos: readCocosVersion(targetRoot), cocosSupported: false };
  }

  // 2) 拷贝 + 算指纹。
  const lockFiles = {};
  const copied = [];
  for (const f of managed) {
    const buf = fs.readFileSync(f.abs);
    lockFiles[f.canonical] = fingerprint(buf); // 指纹基于归一化内容
    const dest = path.join(targetRoot, denormalizePath(f.canonical, installPaths));
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf); // .meta 原样写入，canonical uuid 不让 Cocos 重生
    }
    copied.push(denormalizePath(f.canonical, installPaths));
  }

  // 3) 写 lock。
  const lock = { packageVersion, installPaths, files: lockFiles };
  const lockPath = dryRun ? null : writeLock(targetRoot, lock);

  // 4) Cocos 版本探测（warn 不拦）。
  const cocos = readCocosVersion(targetRoot);
  const cocosSupported = cocos ? isSupportedCocos(cocos.version) : false;

  return { copied, lockPath, collisions: [], cocos, cocosSupported };
}

module.exports = { install, detectUuidCollisions, DEFAULT_INSTALL_PATHS };
