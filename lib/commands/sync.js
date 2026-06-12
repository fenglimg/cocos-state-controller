'use strict';

/**
 * csc sync --upstream（P5，§5.2）：算 consumer 相对装的版本 pristine 的真实改动 → 输出 patch
 * 交 AI Skill 据 §4 漂移政策取舍 + 开 GitHub PR。
 *
 * 流程：读 lock(vX) → vX pristine 基线(reconstructBaseline，单测注入本地) → 反归一化到 canonical 路径
 *       → 逐文件 unified diff（patch 标签用 canonical 路径，PR 落源仓布局）。
 * 范围：只 managed runtime+panel（lock.files 天然只含这些，不含 tests）。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readLock } = require('../lock');
const { denormalizePath, normalizePath, normalizeContent } = require('../normalize');
const { walkFiles } = require('../manifest');

/** 生成单文件 unified diff（canonical 路径标签）。无差异返回空串。 */
function makePatch(label, a, b) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csc-patch-'));
  const fa = path.join(dir, 'a');
  const fb = path.join(dir, 'b');
  fs.writeFileSync(fa, a);
  fs.writeFileSync(fb, b);
  let out = '';
  try {
    execFileSync('diff', ['-u', '-L', 'a/' + label, '-L', 'b/' + label, fa, fb], { encoding: 'utf8' });
  } catch (e) {
    if (e.stdout != null) out = e.stdout.toString(); // diff exit=1 → 有差异，stdout 是 patch
    else {
      fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

function readPayloadFile(root, canonical) {
  if (!root) return null;
  const p = path.join(root, canonical);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/**
 * @param {{ targetRoot: string, basePayloadRoot: string }} opts
 * @returns {{ changes: object[], patch: string, summary: object, hasChanges: boolean }}
 */
function sync(opts) {
  const { targetRoot, basePayloadRoot } = opts;
  const lock = readLock(targetRoot);
  if (!lock) throw new Error('未安装：先 csc install');

  const changes = [];
  const seen = new Set();

  // modified / removed：基于 lock.files。
  for (const canonical of Object.keys(lock.files)) {
    seen.add(canonical);
    const base = readPayloadFile(basePayloadRoot, canonical);
    const oursPath = path.join(targetRoot, denormalizePath(canonical, lock.installPaths));
    if (!fs.existsSync(oursPath)) {
      changes.push({ canonical, status: 'removed', patch: makePatch(canonical, base || '', '') });
      continue;
    }
    const ours = fs.readFileSync(oursPath, 'utf8');
    if (base != null && normalizeContent(ours) === normalizeContent(base)) continue; // 无改动
    changes.push({ canonical, status: 'modified', patch: makePatch(canonical, base || '', ours) });
  }

  // added：consumer 安装目录里 lock 没记录的 managed 文件（runtime/panel 目录包独占）。
  for (const key of ['runtime', 'panel']) {
    const instRel = lock.installPaths[key];
    if (!instRel) continue;
    const instDir = path.join(targetRoot, instRel);
    if (!fs.existsSync(instDir)) continue;
    for (const rel of walkFiles(instDir)) {
      const canonical = normalizePath(instRel + '/' + rel, lock.installPaths);
      if (seen.has(canonical)) continue;
      const ours = fs.readFileSync(path.join(instDir, rel), 'utf8');
      changes.push({ canonical, status: 'added', patch: makePatch(canonical, '', ours) });
    }
  }

  changes.sort((a, b) => (a.canonical < b.canonical ? -1 : 1));
  const patch = changes.map((c) => c.patch).filter(Boolean).join('');
  const summary = {
    modified: changes.filter((c) => c.status === 'modified').length,
    added: changes.filter((c) => c.status === 'added').length,
    removed: changes.filter((c) => c.status === 'removed').length,
  };
  return { changes, patch, summary, hasChanges: changes.length > 0 };
}

module.exports = { sync, makePatch };
