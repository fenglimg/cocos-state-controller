#!/usr/bin/env node
'use strict';

/**
 * csc — @fenglimg/cocos-state-controller 分发/同步 CLI 入口。
 *
 * P0: 命令路由骨架。各子命令在后续阶段填充：
 *   install / diff / doctor → P3   update → P4   sync → P5
 *   migrate / skill        → P6    核心数据层 / 三方引擎 → P1 / P2
 *
 * 设计：入口只做 argv 路由 + help/version；命令实现落 lib/commands/*（P1 起建）。
 */

const fs = require('fs');
const path = require('path');
const installMod = require('../lib/commands/install');
const diffMod = require('../lib/commands/diff');
const doctorMod = require('../lib/commands/doctor');
const updateMod = require('../lib/commands/update');
const syncMod = require('../lib/commands/sync');
const migrateMod = require('../lib/commands/migrate');
const skillMod = require('../lib/commands/skill');
const uninstallMod = require('../lib/commands/uninstall');
const lockMod = require('../lib/lock');
const baselineMod = require('../lib/baseline');
const ui = require('../lib/ui');

/** @typedef {(args: string[]) => (number|void|Promise<number|void>)} CommandHandler */

/** 极简 flag 解析：--key value / --flag。 */
function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (/^-[a-zA-Z]+$/.test(a)) {
      for (const ch of a.slice(1)) flags[ch] = true; // 短 flag（-y 等）按布尔
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function cmdInstall(args) {
  const { flags } = parseFlags(args);
  const payloadRoot = path.join(__dirname, '..');
  const targetRoot = process.cwd();
  const pkg = require(path.join(payloadRoot, 'package.json'));
  const yes = !!flags.yes || !!flags.y || !!flags.force;
  const installPaths = { ...installMod.DEFAULT_INSTALL_PATHS };
  if (flags['runtime-path']) installPaths.runtime = flags['runtime-path'];
  if (flags['panel-path']) installPaths.panel = flags['panel-path'];
  if (flags.version) ui.warn('--version 跨版本安装自 P4 起支持，当前用 CLI 自带版本净荷。');

  // 确认矩阵：重装且会覆盖本地改动 → 先确认（首装/无改动静默）。
  if (lockMod.readLock(targetRoot)) {
    let drift = { modified: [] };
    try {
      drift = diffMod.diffInstalled(targetRoot);
    } catch (e) {
      /* lock 读不出按无改动处理 */
    }
    if (drift.modified.length) {
      ui.warn(`重装会覆盖 ${drift.modified.length} 个你改过的文件：`);
      drift.modified.forEach((p) => ui.muted(p));
      const ans = await ui.confirm('确认覆盖这些本地改动并重装？', { yes });
      if (ans === 'non-interactive') {
        ui.fail('非交互环境无法确认，请加 --yes 确认覆盖');
        return 1;
      }
      if (ans === 'no') {
        ui.step('已取消');
        return 0;
      }
    }
  }

  const r = installMod.install({ payloadRoot, targetRoot, packageVersion: pkg.version, installPaths });
  if (r.collisions.length) {
    ui.fail('uuid 撞车，已中止安装（未改任何文件）：');
    for (const c of r.collisions) {
      ui.muted(`${c.uuid}\n    包→ ${c.packageDest}\n    冲突← ${c.consumerFiles.join(', ')}`);
    }
    ui.step('请重生成本地冲突方的 uuid（绝不动包的），再重试。');
    return 1;
  }
  if (!r.cocos) ui.warn('未探测到 Cocos 版本（project.json）');
  else if (!r.cocosSupported) ui.warn(`Cocos ${r.cocos.version} 不在 2.4.x 支持范围（仅警告）`);
  else ui.ok(`Cocos ${r.cocos.version}`);

  // 默认随装分发 agent skills → .claude/.codex（--no-skill 可关）。
  let skillCount = 0;
  if (!flags['no-skill']) {
    const s = skillMod.skillInstall({ packageRoot: payloadRoot, projectRoot: targetRoot, target: 'all' });
    skillCount = s.installed.length;
    if (skillCount) ui.ok(`分发 ${skillCount} 个 skill：${s.installed.join(', ')}`);
  }

  ui.blank();
  ui.footer('ok', `安装完成：${r.copied.length} 个文件${skillCount ? ` + ${skillCount} 个 skill` : ''} → ${targetRoot}`);
  ui.step('重启 Cocos 编辑器以加载面板');
  return 0;
}

function cmdDiff() {
  let r;
  try {
    r = diffMod.diffInstalled(process.cwd());
  } catch (e) {
    ui.fail(e.message);
    return 1;
  }
  const total = r.added.length + r.removed.length + r.modified.length;
  if (!total) {
    ui.footer('ok', '无差异（与装的版本一致）');
    return 0;
  }
  r.added.forEach((p) => ui.muted(`+ ${p}`));
  r.removed.forEach((p) => ui.muted(`- ${p}`));
  r.modified.forEach((p) => ui.muted(`~ ${p}`));
  ui.blank();
  ui.footer('warn', `共 ${total} 项（+${r.added.length} -${r.removed.length} ~${r.modified.length}）`);
  return 0;
}

function cmdDoctor() {
  const r = doctorMod.doctor(process.cwd());
  // status→ui 级别映射（skipped→skip；其余同名）；每条体检是「报告数据」，✗ 也走报告通道。
  const level = { ok: 'ok', warn: 'warn', fail: 'fail', skipped: 'skip' };
  for (const c of r.checks) ui.report(level[c.status] || 'skip', `${c.name}: ${c.detail}`);
  ui.blank();
  ui.footer(r.ok ? 'ok' : 'fail', `体检${r.ok ? '通过' : '发现问题'}`);
  return r.ok ? 0 : 1;
}

async function cmdUpdate(args) {
  const { flags } = parseFlags(args);
  const targetRoot = process.cwd();
  const yes = !!flags.yes || !!flags.y || !!flags.force;
  const lock = lockMod.readLock(targetRoot);
  if (!lock) {
    ui.fail('未安装：先 csc install');
    return 1;
  }

  // 确认矩阵：update 改写已装文件、可能产冲突标记 → 总是确认。
  const ans = await ui.confirm(`确认从 v${lock.packageVersion} 更新？会改写已装文件（改过的走三方合并，可能产冲突标记）`, { yes });
  if (ans === 'non-interactive') {
    ui.fail('非交互环境无法确认，请加 --yes 确认更新');
    return 1;
  }
  if (ans === 'no') {
    ui.step('已取消');
    return 0;
  }

  const pkg = require(path.join(__dirname, '..', 'package.json')).name;
  let basePayloadRoot;
  let newPayloadRoot;
  try {
    // base = lock 记录的 vX pristine；new = 目标版本（默认 latest）。本地 dogfood 可用 --base-payload/--new-payload 覆盖。
    basePayloadRoot = flags['base-payload'] || baselineMod.reconstructBaseline({ pkg, version: lock.packageVersion });
    newPayloadRoot = flags['new-payload'] || baselineMod.reconstructBaseline({ pkg, version: flags.version || 'latest' });
  } catch (e) {
    ui.fail('取净荷失败（跨版本 update 需包已发布到 npm）：' + e.message);
    return 1;
  }

  const r = updateMod.update({ targetRoot, basePayloadRoot, newPayloadRoot, newVersion: flags.version });
  const R = r.results;
  if (r.hasConflict) {
    ui.warn('冲突文件（含 <<<< 标记），需人工/AI 解：');
    R.conflict.forEach((p) => ui.muted(p));
  }
  ui.blank();
  ui.footer(r.hasConflict ? 'warn' : 'ok',
    `更新到 v${r.packageVersion}：clean ${R.clean.length} / merged ${R.merged.length} / conflict ${R.conflict.length} / added ${R.added.length} / removed ${R.removed.length}`);
  return r.hasConflict ? 1 : 0;
}

function cmdSync(args) {
  ui.artifactMode(); // patch 走 stdout，人类输出降级 stderr
  const { flags } = parseFlags(args);
  if (!flags.upstream) {
    ui.fail('用法: csc sync --upstream [--output patch.diff]');
    return 2;
  }
  const targetRoot = process.cwd();
  const lock = lockMod.readLock(targetRoot);
  if (!lock) {
    ui.fail('未安装：先 csc install');
    return 1;
  }
  const pkg = require(path.join(__dirname, '..', 'package.json')).name;
  let basePayloadRoot;
  try {
    basePayloadRoot = flags['base-payload'] || baselineMod.reconstructBaseline({ pkg, version: lock.packageVersion });
  } catch (e) {
    ui.fail('取基线失败（需包已发布到 npm）：' + e.message);
    return 1;
  }

  const r = syncMod.sync({ targetRoot, basePayloadRoot });
  if (!r.hasChanges) {
    ui.footer('ok', '无上行改动（与装的版本一致）');
    return 0;
  }
  if (flags.output && typeof flags.output === 'string') {
    fs.writeFileSync(flags.output, r.patch);
    ui.ok(`patch 写入 ${flags.output}`);
  } else {
    ui.emit(r.patch); // 机器产物 → stdout
  }
  ui.blank();
  ui.footer('ok', `改动 modified ${r.summary.modified} / added ${r.summary.added} / removed ${r.summary.removed}（交上行 PR skill 据 §4 漂移政策取舍 + 开 GitHub PR）`);
  return 0;
}

async function cmdMigrate(args) {
  ui.artifactMode(); // 改写/dry-run 产物走 stdout，人类输出降级 stderr
  const { flags, positional } = parseFlags(args);
  if (!positional.length) {
    ui.fail('用法: csc migrate <prefab|dir...> [--write] [--backup] [--allow-remote] [--yes]');
    return 2;
  }
  const yes = !!flags.yes || !!flags.y || !!flags.force;

  // 确认矩阵：--write 原地改写 prefab → 确认。
  if (flags.write) {
    const ans = await ui.confirm(`确认就地改写 ${positional.length} 个目标的 prefab/scene？${flags.backup ? '（已开 --backup）' : '（建议加 --backup）'}`, { yes });
    if (ans === 'non-interactive') {
      ui.fail('非交互环境无法确认，请加 --yes 确认改写');
      return 1;
    }
    if (ans === 'no') {
      ui.step('已取消');
      return 0;
    }
  }

  const packageRoot = path.join(__dirname, '..');
  const r = migrateMod.migrate({
    targets: positional,
    projectRoot: process.cwd(),
    packageRoot,
    write: !!flags.write,
    backup: !!flags.backup,
    allowRemote: !!flags['allow-remote'],
  });
  if (!r.ok) {
    ui.fail('remote bundle 默认拒绝迁移（迁 V2-cid 会崩仅 V1 runtime 的老客户端）：');
    r.blocked.forEach((b) => ui.muted(`${b.file} — ${b.reason}`));
    ui.step('确认全客户端已铺 V1+V2 共存 runtime 后，加 --allow-remote 重试。');
    return 1;
  }
  if (r.output) ui.emit(r.output); // 机器产物 → stdout
  if (r.blocked.length) ui.warn(`${r.blocked.length} 个 remote bundle 文件已放行（--allow-remote）`);
  ui.blank();
  ui.footer('ok', `迁移${flags.write ? '改写' : 'dry-run'}完成：${positional.length} 个目标`);
  return 0;
}

function cmdSkill(args) {
  const [sub, ...rest] = args;
  if (sub !== 'install') {
    ui.fail('用法: csc skill install [--target claude|codex|all]');
    return 2;
  }
  const { flags } = parseFlags(rest);
  const packageRoot = path.join(__dirname, '..');
  const r = skillMod.skillInstall({ packageRoot, projectRoot: process.cwd(), target: flags.target || 'all' });
  r.installed.forEach((t) => ui.muted(t));
  ui.blank();
  ui.footer('ok', `安装 ${r.installed.length} 个 skill 目标`);
  return 0;
}

async function cmdUninstall(args) {
  const { flags } = parseFlags(args);
  const targetRoot = process.cwd();
  const payloadRoot = path.join(__dirname, '..');
  const force = !!flags.force;
  const yes = force || !!flags.yes || !!flags.y;
  const keepSkill = !!flags['keep-skill'];
  const dryRun = !!flags['dry-run'];

  let plan;
  try {
    plan = uninstallMod.computeUninstallPlan(targetRoot, { payloadRoot, keepSkill });
  } catch (e) {
    ui.fail(e.message + '（先 csc install）');
    return 1;
  }

  // 引用硬闸：被 prefab/scene 引用则中止，绝不删。
  if (plan.referenced.length && !force) {
    ui.fail(`${plan.referenced.length} 处预制体/场景仍在引用本组件，已中止（未删任何文件）：`);
    plan.referenced.forEach((r) => ui.muted(r.file));
    ui.step('删脚本会致 Missing Script，保存即永久丢组件。请先在编辑器移除这些组件，或加 --force 强删。');
    return 1;
  }
  if (plan.referenced.length && force) {
    ui.warn(`${plan.referenced.length} 处资源仍在引用本组件，--force 强删（重装可凭 canonical uuid 自动重连，卸载期间勿保存这些资源）`);
  }

  const fileCount = plan.toDelete.clean.length + plan.toDelete.modified.length;
  const skillNote = plan.skills.length ? ` + ${plan.skills.length} 个 skill` : '';

  // dry-run：只预览，不确认、不删。
  if (dryRun) {
    ui.step(`将移除 ${fileCount} 个文件${skillNote}`);
    [...plan.toDelete.clean, ...plan.toDelete.modified].sort().forEach((f) => ui.muted(f));
    if (plan.emptyDirs.length) ui.muted(`空目录回收：${plan.emptyDirs.join(', ')}`);
    if (plan.keptAdded.length) ui.muted(`保留你新增的 ${plan.keptAdded.length} 个文件`);
    ui.blank();
    ui.footer('ok', 'dry-run：以上为移除计划，未改动任何文件');
    return 0;
  }

  // 确认（--yes/--force 跳；非 TTY 无 --yes 报错）。
  const modNote = plan.toDelete.modified.length ? `（含 ${plan.toDelete.modified.length} 个你改过的）` : '';
  const ans = await ui.confirm(`确认卸载 v${plan.packageVersion}？将移除 ${fileCount} 个文件${skillNote}${modNote}`, { yes });
  if (ans === 'non-interactive') {
    ui.fail('非交互环境无法确认，请加 --yes 确认卸载');
    return 1;
  }
  if (ans === 'no') {
    ui.step('已取消');
    return 0;
  }

  const r = uninstallMod.applyUninstall(plan, { targetRoot, payloadRoot });
  ui.blank();
  ui.footer('ok', `卸载完成：移除 ${r.removed.length} 个文件${r.removedSkills.length ? ` + ${r.removedSkills.length} 个 skill` : ''}`);
  if (plan.toDelete.modified.length) ui.muted(`其中 ${plan.toDelete.modified.length} 个你改过的文件已删（git 可恢复）`);
  if (plan.keptAdded.length) {
    ui.muted(`保留了你新增的 ${plan.keptAdded.length} 个文件：${plan.keptAdded.slice(0, 3).join(', ')}${plan.keptAdded.length > 3 ? ' …' : ''}`);
  }
  ui.step('重启 Cocos 编辑器以卸载面板');
  return 0;
}

/** @type {Record<string, { phase: string, summary: string, handler: CommandHandler }>} */
const COMMANDS = {
  install: { phase: 'P3', summary: '拷净荷 + 写 .meta + 写 .csc/lock.json + uuid 撞车预检 + 分发 skill(.claude/.codex，--no-skill 关) + 提示重启编辑器',
    handler: cmdInstall },
  update: { phase: 'P4', summary: '取新版净荷：未改的覆盖 / 改过的三方合并；更新 lock',
    handler: cmdUpdate },
  diff: { phase: 'P3', summary: 'consumer 当前 vs 装的版本 pristine（归一化后）列 新增/删除/修改',
    handler: cmdDiff },
  doctor: { phase: 'P3', summary: '体检：文件齐全 / .meta uuid / uuid 撞车 / V1 cid 残留 / Cocos 版本 / lock 一致',
    handler: cmdDoctor },
  migrate: { phase: 'P6', summary: '确定性 prefab V1→V2 迁移引擎（remote bundle 默认拒绝）',
    handler: cmdMigrate },
  sync: { phase: 'P5', summary: '重建 vX 基线 + 反归一化 + 三方 diff → 输出 patch（交 AI Skill 开 PR）',
    handler: cmdSync },
  skill: { phase: 'P6', summary: '分发 skills 到 .claude/.codex',
    handler: cmdSkill },
  uninstall: { phase: 'P3', summary: '按 lock 移除 managed 文件 + .csc/ + skills（回退）；引用硬闸 + 二次确认（--force/--yes/--keep-skill/--dry-run）',
    handler: cmdUninstall }
};

function printVersion() {
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  console.log(`${pkg.name} ${pkg.version}`);
  return 0;
}

function printHelp() {
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  console.log(`${pkg.name} — csc CLI\n`);
  console.log('用法: csc <command> [options]\n');
  console.log('命令:');
  const width = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  for (const [name, { phase, summary }] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(width)}  [${phase}] ${summary}`);
  }
  console.log('\n  --help, -h      显示此帮助');
  console.log('  --version, -v   显示版本');
  return 0;
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return printHelp();
  if (cmd === '--version' || cmd === '-v') return printVersion();

  const entry = COMMANDS[cmd];
  if (!entry) {
    ui.fail(`未知命令: ${cmd}`);
    printHelp();
    return 2; // 用法错误
  }
  const code = await entry.handler(rest);
  return typeof code === 'number' ? code : 0;
}

main(process.argv.slice(2))
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    ui.fail('致命错误: ' + (err && err.stack ? err.stack : err));
    process.exitCode = 1;
  });
