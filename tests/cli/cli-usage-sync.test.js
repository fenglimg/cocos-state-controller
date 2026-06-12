'use strict';

/**
 * 防漂移 gate：cli-usage.md 必须覆盖 bin/csc.js 暴露的每个命令。
 * 改了 CLI 命令集而忘改 ref → 这里红。
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');

/** 从 bin/csc.js 的 COMMANDS 块提取命令名（`  install: { phase:` 形态）。 */
function extractCommands(binSrc) {
  const re = /^ {2}(\w+):\s*\{\s*phase:/gm;
  const cmds = [];
  let m;
  while ((m = re.exec(binSrc))) cmds.push(m[1]);
  return cmds;
}

const binSrc = fs.readFileSync(path.join(REPO, 'bin/csc.js'), 'utf8');
const usage = fs.readFileSync(path.join(REPO, 'skills/cocos-state-controller/refs/cli-usage.md'), 'utf8');
const commands = extractCommands(binSrc);

describe('cli-usage.md ↔ bin/csc.js 命令同步', () => {
  test('bin 暴露预期命令集', () => {
    expect(commands.slice().sort()).toEqual(
      ['diff', 'doctor', 'install', 'migrate', 'skill', 'sync', 'uninstall', 'update'].sort()
    );
  });

  test.each(commands)('cli-usage.md 覆盖命令 %s', (cmd) => {
    expect(usage).toMatch(new RegExp(`##\\s+${cmd}\\b`));
  });
});
