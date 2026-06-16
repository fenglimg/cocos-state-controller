'use strict';

/**
 * csc uninstall（P3）：按 lock 回退安装（移除 managed 文件 + .csc/ + skills），逆 install。
 *
 * 两段式（交互确认天然需要暂停点，故拆只读「算计划」与「执行删除」）：
 *   computeUninstallPlan(targetRoot, opts) —— 纯只读，产出移除计划（引用闸 / dry-run / 确认预览共用）。
 *   applyUninstall(plan, opts)             —— 执行 fs 删除，返回结果。
 *
 * 安全模型（设计十题已定）：
 *   · 引用硬闸：prefab/scene 仍以 __type__ 引用 StateController/StateSelect → plan.referenced 非空，
 *     bin 层据此中止（--force 跳）。删脚本会致 Missing Script，保存即永久丢组件。
 *   · 改动软提示：改过的文件照删（git 可恢复），plan.toDelete.modified 供 bin 末尾提示。
 *   · 用户新增文件（在安装目录但不在 lock）：保留，plan.keptAdded 供提示。
 */

const fs = require('fs');
const path = require('path');
const { readLock, cscDir } = require('../lock');
const { denormalizePath } = require('../normalize');
const { fingerprint } = require('../fingerprint');
const { compressUuid, scanComponentUsage } = require('../cocos');
const { enumerateManagedFiles, walkFiles } = require('../manifest');
const { skillTargets, skillUninstall } = require('./skill');

/** 从净荷 .ts.meta 取本包可挂载组件的压缩 uuid（canonical uuid 固定，净荷是权威源）。 */
function packageComponentUuids(payloadRoot) {
  const uuids = [];
  if (!payloadRoot) return uuids;
  let managed;
  try {
    managed = enumerateManagedFiles(payloadRoot);
  } catch (e) {
    return uuids; // 净荷不可读 → 无法扫，交由 bin 决策（保守可视作无引用）
  }
  for (const f of managed) {
    if (!f.canonical.endsWith('.ts.meta')) continue; // 仅脚本 meta → 可挂节点的组件
    try {
      const j = JSON.parse(fs.readFileSync(f.abs, 'utf8'));
      if (j.uuid) uuids.push(compressUuid(j.uuid));
    } catch (e) {
      /* 坏 meta 跳过 */
    }
  }
  return uuids;
}

/**
 * @param {string} targetRoot consumer 工程根
 * @param {{ payloadRoot?: string, keepSkill?: boolean, target?: string }} [opts]
 * @returns {{ packageVersion, installPaths, referenced, toDelete, skills, emptyDirs, keptAdded }}
 */
function computeUninstallPlan(targetRoot, opts = {}) {
  const lock = readLock(targetRoot);
  if (!lock) throw new Error('未安装：.csc/lock.json 不存在');

  const { payloadRoot, keepSkill = false, target = 'all' } = opts;
  const installPaths = lock.installPaths;

  // 1) 引用硬闸扫描。
  const referenced = scanComponentUsage(targetRoot, packageComponentUuids(payloadRoot));

  // 2) lock 文件按状态分类（干净/改过/已缺失）。
  const toDelete = { clean: [], modified: [], missing: [] };
  const deleteSet = new Set(); // 反归一化后的 consumer 相对路径
  for (const canonical of Object.keys(lock.files)) {
    const rel = denormalizePath(canonical, installPaths);
    const full = path.join(targetRoot, rel);
    if (!fs.existsSync(full)) {
      toDelete.missing.push(rel);
      continue;
    }
    deleteSet.add(rel);
    const fp = fingerprint(fs.readFileSync(full));
    if (fp === lock.files[canonical]) toDelete.clean.push(rel);
    else toDelete.modified.push(rel);
  }

  // 3) 安装目录：删空则回收，用户新增文件保留。
  const emptyDirs = [];
  const keptAdded = [];
  for (const key of ['runtime', 'panel']) {
    const instRel = installPaths[key];
    if (!instRel) continue;
    const instDir = path.join(targetRoot, instRel);
    if (!fs.existsSync(instDir)) continue;
    const filesNow = walkFiles(instDir).map((r) => instRel + '/' + r);
    const remaining = filesNow.filter((f) => !deleteSet.has(f));
    keptAdded.push(...remaining);
    if (filesNow.length > 0 && remaining.length === 0) emptyDirs.push(instRel);
  }

  // 4) skills：默认删本包子目录，--keep-skill 保留。
  const skills = keepSkill || !payloadRoot
    ? []
    : skillTargets(payloadRoot, target).filter((t) => fs.existsSync(path.join(targetRoot, t)));

  return {
    packageVersion: lock.packageVersion,
    installPaths,
    referenced,
    toDelete,
    skills,
    emptyDirs,
    keptAdded: keptAdded.sort(),
  };
}

/** 删空目录链：从文件所在目录向上删到（不含）安装根的父级，遇非空即止。 */
function pruneEmptyDirs(targetRoot, relFile) {
  let dir = path.dirname(path.join(targetRoot, relFile));
  const stop = path.resolve(targetRoot);
  while (path.resolve(dir) !== stop && path.resolve(dir).startsWith(stop)) {
    try {
      if (fs.readdirSync(dir).length > 0) break;
      fs.rmdirSync(dir);
    } catch (e) {
      break;
    }
    dir = path.dirname(dir);
  }
}

/**
 * @param {object} plan computeUninstallPlan 产物
 * @param {{ targetRoot: string, payloadRoot?: string, target?: string, dryRun?: boolean }} opts
 * @returns {{ removed: string[], removedSkills: string[], removedCsc: boolean, dryRun: boolean }}
 */
function applyUninstall(plan, opts) {
  const { targetRoot, payloadRoot, target = 'all', dryRun = false } = opts;
  const removed = [];

  for (const rel of [...plan.toDelete.clean, ...plan.toDelete.modified]) {
    if (!dryRun) {
      fs.rmSync(path.join(targetRoot, rel), { force: true });
      pruneEmptyDirs(targetRoot, rel);
    }
    removed.push(rel);
  }

  // skills（dryRun 透传给 skillUninstall）。
  let removedSkills = [];
  if (plan.skills.length && payloadRoot) {
    removedSkills = skillUninstall({ packageRoot: payloadRoot, projectRoot: targetRoot, target, dryRun }).removed;
  }

  // .csc/（卸载标志，最后删）。
  const csc = cscDir(targetRoot);
  const removedCsc = fs.existsSync(csc);
  if (!dryRun && removedCsc) fs.rmSync(csc, { recursive: true, force: true });

  return { removed, removedSkills, removedCsc, dryRun };
}

module.exports = { computeUninstallPlan, applyUninstall, packageComponentUuids };
