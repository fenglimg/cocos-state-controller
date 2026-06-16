'use strict';

/**
 * csc migrate（P6，§8）：包装确定性引擎 tools/migration/migrate-prefab-v1-to-v2.js，
 * 前置 remote bundle 安全门。
 *
 * remote bundle（热更下发）迁移 V2-cid 会崩仅 V1 runtime 的老客户端 → 默认拒绝，
 * 需 --allow-remote 显式确认（全客户端已铺 V1+V2 共存 runtime）才放行。
 * 机械改写交引擎（cid/propKey/stateValue），本包装只管安全门 + 参数转发（Skill 监督下跑）。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENGINE_REL = 'tools/migration/migrate-prefab-v1-to-v2.js';

function enginePath(packageRoot) {
  return path.join(packageRoot, ENGINE_REL);
}

/** 检测 prefab 是否在 remote bundle。返回 { remote, reason? }。 */
function detectRemoteBundle(absPath, projectRoot) {
  const rel = path.relative(projectRoot, absPath);
  if (rel.split(path.sep).includes('RemoteBundles')) {
    return { remote: true, reason: '路径含 RemoteBundles/' };
  }
  const rootResolved = path.resolve(projectRoot);
  let dir = path.dirname(absPath);
  // 向上查祖先目录的 <dir>.meta：isBundle && remote 标记 → 命中
  for (;;) {
    const metaPath = dir + '.meta';
    if (fs.existsSync(metaPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const ud = m.userData || {};
        const isBundle = m.isBundle || ud.isBundle;
        const isRemote = m.isRemote || m.isRemoteBundle || ud.isRemote || ud.isRemoteBundle;
        if (isBundle && isRemote) return { remote: true, reason: `bundle ${path.basename(dir)} 标记 remote` };
      } catch (e) {
        /* 坏 meta 跳过 */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir || path.resolve(dir) === rootResolved) break;
    dir = parent;
  }
  return { remote: false };
}

/** 展开目标为 .prefab/.fire 文件列表。 */
function collectTargets(targets, projectRoot) {
  const out = [];
  const walk = (p) => {
    if (!fs.existsSync(p)) return;
    if (fs.statSync(p).isDirectory()) {
      for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    } else if (/\.(prefab|fire)$/.test(p)) {
      out.push(p);
    }
  };
  for (const t of targets) walk(path.resolve(projectRoot, t));
  return out;
}

/** 从引擎 stderr 提取一条可读原因（首个非堆栈行，去掉 `Error:` 前缀）。 */
function extractEngineError(stderr, fallback) {
  const line = String(stderr || '')
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith('at '));
  return line ? line.replace(/^Error:\s*/, '') : fallback || 'engine failed';
}

/**
 * @param {{ targets: string[], projectRoot?: string, packageRoot: string, controllerDir?: string,
 *           write?: boolean, backup?: boolean, allowRemote?: boolean, dryRunEngine?: boolean }} opts
 * @returns {{ ok: boolean, reason?: string, blocked: object[], ran: boolean,
 *             output?: string, files: string[], engineError?: string, engineStack?: string }}
 *   reason: 'no-targets' | 'remote-blocked' | 'engine-error'（ok=false 时区分失败类型）。
 */
function migrate(opts) {
  const { targets, projectRoot = process.cwd(), packageRoot, controllerDir,
    write = false, backup = false, allowRemote = false, dryRunEngine = false } = opts;

  const files = collectTargets(targets, projectRoot);

  // 无匹配目标 → 提前干净退出，不跑引擎（否则引擎在 type-map 阶段先撞，错误答非所问）。
  if (!files.length) {
    return { ok: false, reason: 'no-targets', blocked: [], ran: false, files: [] };
  }

  // remote 安全门
  const blocked = [];
  for (const f of files) {
    const d = detectRemoteBundle(f, projectRoot);
    if (d.remote) blocked.push({ file: path.relative(projectRoot, f), reason: d.reason });
  }
  if (blocked.length && !allowRemote) {
    return { ok: false, reason: 'remote-blocked', blocked, ran: false, files };
  }

  // 转发给确定性引擎。controllerDir 来自 lock 的 installPaths.runtime，让引擎按真实位置找 V2 meta。
  const args = [enginePath(packageRoot)];
  if (write) args.push('--write');
  if (backup) args.push('--backup');
  if (controllerDir) args.push('--controller-dir', controllerDir);
  args.push('--root', projectRoot, ...targets);

  let output;
  if (!dryRunEngine) {
    try {
      // stderr 走 pipe（不 inherit）→ 引擎栈不实时回显，错误统一由调用方一条呈现。
      output = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      const stderr = e.stderr ? e.stderr.toString() : '';
      return {
        ok: false,
        reason: 'engine-error',
        blocked,
        ran: false,
        files,
        engineError: extractEngineError(stderr, e.message),
        engineStack: stderr || (e.stack || ''),
      };
    }
  }
  return { ok: true, blocked, ran: !dryRunEngine, output, files };
}

module.exports = { migrate, detectRemoteBundle, collectTargets, enginePath, extractEngineError };
