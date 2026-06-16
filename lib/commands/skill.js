'use strict';

/**
 * csc skill install（P6，§8/§10）：把包内 skills 分发到 .claude/skills + .codex/skills。
 *
 * 分发清单来自 manifest 中带 targets[]（复数）的 agent-skill* mapping。
 * --target claude|codex|all 过滤目标 agent 目录。
 */

const fs = require('fs');
const path = require('path');
const { readManifest } = require('../manifest');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function matchTarget(targetPath, want) {
  if (want === 'all') return true;
  if (want === 'claude') return targetPath.includes('.claude');
  if (want === 'codex') return targetPath.includes('.codex');
  return false;
}

/**
 * @param {{ packageRoot: string, projectRoot?: string, target?: string, dryRun?: boolean }} opts
 * @returns {{ installed: string[] }}
 */
function skillInstall(opts) {
  const { packageRoot, projectRoot = process.cwd(), target = 'all', dryRun = false } = opts;
  const manifest = readManifest(packageRoot);
  const installed = [];

  for (const map of manifest.targetMappings) {
    if (!Array.isArray(map.targets)) continue; // 只 agent-skill* 用 targets[]
    const src = path.join(packageRoot, map.source);
    if (!fs.existsSync(src)) continue;
    for (const t of map.targets) {
      if (!matchTarget(t, target)) continue;
      if (!dryRun) copyDir(src, path.join(projectRoot, t));
      installed.push(t);
    }
  }
  return { installed };
}

/**
 * 本包分发的 skill 目标相对路径（manifest targets[] 反推，install/uninstall 共用）。
 * @returns {string[]} 如 ['.claude/skills/cocos-state-controller', ...]
 */
function skillTargets(packageRoot, target = 'all') {
  const manifest = readManifest(packageRoot);
  const out = [];
  for (const map of manifest.targetMappings) {
    if (!Array.isArray(map.targets)) continue;
    for (const t of map.targets) {
      if (matchTarget(t, target)) out.push(t);
    }
  }
  return out;
}

/**
 * 对称 skillInstall：移除本包分发的 skill 子目录（只删本包自己的，不碰整个 .claude/skills）。
 * @param {{ packageRoot: string, projectRoot?: string, target?: string, dryRun?: boolean }} opts
 * @returns {{ removed: string[] }}
 */
function skillUninstall(opts) {
  const { packageRoot, projectRoot = process.cwd(), target = 'all', dryRun = false } = opts;
  const removed = [];
  for (const t of skillTargets(packageRoot, target)) {
    const dst = path.join(projectRoot, t);
    if (!fs.existsSync(dst)) continue;
    if (!dryRun) fs.rmSync(dst, { recursive: true, force: true });
    removed.push(t);
  }
  return { removed };
}

module.exports = { skillInstall, skillUninstall, skillTargets, copyDir };
