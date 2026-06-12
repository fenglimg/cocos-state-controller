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

module.exports = { skillInstall, copyDir };
