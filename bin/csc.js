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

/** @typedef {(args: string[]) => (number|void|Promise<number|void>)} CommandHandler */

/** 后续阶段把这些占位换成 require('../lib/commands/<cmd>')。 */
function notYetImplemented(name, phase) {
  return function () {
    console.error(`csc ${name}: 尚未实现（${phase}）`);
    return 2;
  };
}

/** @type {Record<string, { phase: string, summary: string, handler: CommandHandler }>} */
const COMMANDS = {
  install: { phase: 'P3', summary: '拷净荷 + 写 .meta + 写 .csc/lock.json + uuid 撞车预检 + 提示重启编辑器',
    handler: notYetImplemented('install', 'P3') },
  update: { phase: 'P4', summary: '取新版净荷：未改的覆盖 / 改过的三方合并；更新 lock',
    handler: notYetImplemented('update', 'P4') },
  diff: { phase: 'P3', summary: 'consumer 当前 vs 装的版本 pristine（归一化后）列 新增/删除/修改',
    handler: notYetImplemented('diff', 'P3') },
  doctor: { phase: 'P3', summary: '体检：文件齐全 / .meta uuid / uuid 撞车 / V1 cid 残留 / Cocos 版本 / lock 一致',
    handler: notYetImplemented('doctor', 'P3') },
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
