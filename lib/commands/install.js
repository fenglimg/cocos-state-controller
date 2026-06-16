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
const { denormalizePath, toPosix, CANONICAL } = require('../normalize');
const { fingerprint } = require('../fingerprint');
const { writeLock } = require('../lock');
const { readCocosVersion, isSupportedCocos, scanMetaUuids } = require('../cocos');

const DEFAULT_INSTALL_PATHS = Object.freeze({
  runtime: CANONICAL.runtime,
  panel: CANONICAL.panel,
});

/**
 * 生成 controller 安装目录的候选列表（交互 select 用）：默认/推荐路径排第一，
 * 其后跟 consumer 工程 assets/ 下已有的子目录（depth≤2，去重默认，限量 8 个）。
 * 纯函数：只读目录树，不产 UI。custom 输入由 bin 层兜底，不在此列。
 * @returns {string[]} canonical-posix 相对路径列表，首项恒为 defaultPath。
 */
function candidateRuntimeDirs(targetRoot, defaultPath) {
  const def = toPosix(defaultPath || CANONICAL.runtime);
  const found = [];
  const walk = (dir, rel, depth) => {
    if (depth > 2) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return; // assets/ 不存在或不可读 → 无候选
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      found.push(`assets/${childRel}`);
      walk(path.join(dir, e.name), childRel, depth + 1);
    }
  };
  walk(path.join(targetRoot, 'assets'), '', 1);
  const existing = found.filter((p) => p !== def).slice(0, 8);
  return [def, ...existing];
}

/**
 * 软校验安装路径与引擎约束（仅产警告，不拦截 —— 尊重用户判断）：
 *   runtime 必须落在 assets/ 下（引擎才当它是脚本资源）；
 *   panel 必须落在 packages/ 下（Cocos 2.4 编辑器只从这里加载扩展面板）。
 * @returns {string[]} 警告文案列表（空=无异常）。
 */
function checkInstallPaths(installPaths) {
  const warnings = [];
  const rt = toPosix(installPaths.runtime || '');
  const pn = toPosix(installPaths.panel || '');
  if (rt && !/^assets(\/|$)/.test(rt)) {
    warnings.push(`runtime 路径「${rt}」不在 assets/ 下，引擎可能不当它是脚本资源`);
  }
  if (pn && !/^packages(\/|$)/.test(pn)) {
    warnings.push(`panel 路径「${pn}」不在 packages/ 下，Cocos 编辑器可能不加载该面板`);
  }
  return warnings;
}

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

module.exports = { install, detectUuidCollisions, candidateRuntimeDirs, checkInstallPaths, DEFAULT_INSTALL_PATHS };
