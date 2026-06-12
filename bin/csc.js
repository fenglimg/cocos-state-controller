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

const path = require('path');
const installMod = require('../lib/commands/install');
const diffMod = require('../lib/commands/diff');
const doctorMod = require('../lib/commands/doctor');
const updateMod = require('../lib/commands/update');
const lockMod = require('../lib/lock');
const baselineMod = require('../lib/baseline');

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
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

/** 后续阶段把这些占位换成 require('../lib/commands/<cmd>')。 */
function notYetImplemented(name, phase) {
  return function () {
    console.error(`csc ${name}: 尚未实现（${phase}）`);
    return 2;
  };
}

function cmdInstall(args) {
  const { flags } = parseFlags(args);
  const payloadRoot = path.join(__dirname, '..');
  const targetRoot = process.cwd();
  const pkg = require(path.join(payloadRoot, 'package.json'));
  const installPaths = { ...installMod.DEFAULT_INSTALL_PATHS };
  if (flags['runtime-path']) installPaths.runtime = flags['runtime-path'];
  if (flags['panel-path']) installPaths.panel = flags['panel-path'];
  if (flags.version) console.error('注意：--version 跨版本安装自 P4 起支持，当前用 CLI 自带版本净荷。');

  const r = installMod.install({ payloadRoot, targetRoot, packageVersion: pkg.version, installPaths });
  if (r.collisions.length) {
    console.error('✗ uuid 撞车，已中止安装（未改任何文件）：');
    for (const c of r.collisions) {
      console.error(`  ${c.uuid}\n    包→ ${c.packageDest}\n    冲突← ${c.consumerFiles.join(', ')}`);
    }
    console.error('请重生成本地冲突方的 uuid（绝不动包的），再重试。');
    return 1;
  }
  console.log(`✓ 安装 ${r.copied.length} 个文件 → ${targetRoot}`);
  if (!r.cocos) console.warn('⚠ 未探测到 Cocos 版本（project.json）');
  else if (!r.cocosSupported) console.warn(`⚠ Cocos ${r.cocos.version} 不在 2.4.x 支持范围（仅警告）`);
  else console.log(`  Cocos ${r.cocos.version} ✓`);
  console.log('→ 重启 Cocos 编辑器以加载面板');
  return 0;
}

function cmdDiff() {
  let r;
  try {
    r = diffMod.diffInstalled(process.cwd());
  } catch (e) {
    console.error('✗ ' + e.message);
    return 1;
  }
  const total = r.added.length + r.removed.length + r.modified.length;
  if (!total) {
    console.log('无差异（与装的版本一致）');
    return 0;
  }
  r.added.forEach((p) => console.log(`+ ${p}`));
  r.removed.forEach((p) => console.log(`- ${p}`));
  r.modified.forEach((p) => console.log(`~ ${p}`));
  console.log(`\n共 ${total} 项（+${r.added.length} -${r.removed.length} ~${r.modified.length}）`);
  return 0;
}

function cmdDoctor() {
  const r = doctorMod.doctor(process.cwd());
  const icon = { ok: '✓', warn: '⚠', fail: '✗', skipped: '·' };
  for (const c of r.checks) console.log(`${icon[c.status] || '?'} ${c.name}: ${c.detail}`);
  console.log(`\n体检${r.ok ? '通过' : '发现问题'}`);
  return r.ok ? 0 : 1;
}

function cmdUpdate(args) {
  const { flags } = parseFlags(args);
  const targetRoot = process.cwd();
  const lock = lockMod.readLock(targetRoot);
  if (!lock) {
    console.error('✗ 未安装：先 csc install');
    return 1;
  }
  const pkg = require(path.join(__dirname, '..', 'package.json')).name;
  let basePayloadRoot;
  let newPayloadRoot;
  try {
    // base = lock 记录的 vX pristine；new = 目标版本（默认 latest）。本地 dogfood 可用 --base-payload/--new-payload 覆盖。
    basePayloadRoot = flags['base-payload'] || baselineMod.reconstructBaseline({ pkg, version: lock.packageVersion });
    newPayloadRoot = flags['new-payload'] || baselineMod.reconstructBaseline({ pkg, version: flags.version || 'latest' });
  } catch (e) {
    console.error('✗ 取净荷失败（跨版本 update 需包已发布到 npm）：' + e.message);
    return 1;
  }

  const r = updateMod.update({ targetRoot, basePayloadRoot, newPayloadRoot, newVersion: flags.version });
  const R = r.results;
  console.log(
    `更新到 v${r.packageVersion}：clean ${R.clean.length} / merged ${R.merged.length} / ` +
      `conflict ${R.conflict.length} / added ${R.added.length} / removed ${R.removed.length}`
  );
  if (r.hasConflict) {
    console.warn('⚠ 冲突文件（含 <<<< 标记），需人工/AI 解：');
    R.conflict.forEach((p) => console.warn('  ' + p));
    return 1;
  }
  return 0;
}

/** @type {Record<string, { phase: string, summary: string, handler: CommandHandler }>} */
const COMMANDS = {
  install: { phase: 'P3', summary: '拷净荷 + 写 .meta + 写 .csc/lock.json + uuid 撞车预检 + 提示重启编辑器',
    handler: cmdInstall },
  update: { phase: 'P4', summary: '取新版净荷：未改的覆盖 / 改过的三方合并；更新 lock',
    handler: cmdUpdate },
  diff: { phase: 'P3', summary: 'consumer 当前 vs 装的版本 pristine（归一化后）列 新增/删除/修改',
    handler: cmdDiff },
  doctor: { phase: 'P3', summary: '体检：文件齐全 / .meta uuid / uuid 撞车 / V1 cid 残留 / Cocos 版本 / lock 一致',
    handler: cmdDoctor },
  migrate: { phase: 'P6', summary: '确定性 prefab V1→V2 迁移引擎（remote bundle 默认拒绝）',
    handler: notYetImplemented('migrate', 'P6') },
  sync: { phase: 'P5', summary: '重建 vX 基线 + 反归一化 + 三方 diff → 输出 patch（交 AI Skill 开 PR）',
    handler: notYetImplemented('sync', 'P5') },
  skill: { phase: 'P6', summary: '分发 skills 到 .claude/.codex',
    handler: notYetImplemented('skill', 'P6') },
  uninstall: { phase: 'P3', summary: '按 lock 移除 managed 文件 + .csc/（回退）',
    handler: notYetImplemented('uninstall', 'P3') }
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
    console.error(`未知命令: ${cmd}\n`);
    printHelp();
    return 1;
  }
  const code = await entry.handler(rest);
  return typeof code === 'number' ? code : 0;
}

main(process.argv.slice(2))
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    console.error('csc 致命错误:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  });
