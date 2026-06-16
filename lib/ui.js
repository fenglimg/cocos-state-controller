'use strict';

/**
 * CLI 表现层统一封装（picocolors + prompts）。
 *
 * 规范（全命令共用，引用不复制各命令里的零散 console.log）：
 *  - 词汇：✓ ok(green) / ⚠ warn(yellow) / ✗ fail(red) / → step(cyan) / · skip(dim) / muted(dim 无符号)
 *  - 符号恒在，颜色由 picocolors 按 NO_COLOR/非 TTY 自动开关（非 TTY 留符号去色）。
 *  - stdout/stderr 纪律：
 *      · 人类命令：报告/状态/页脚/warn → stdout。
 *      · 产物命令（sync/migrate）：调 artifactMode() 后人类输出降级到 stderr，产物 emit() 走 stdout。
 *      · fail（操作级错误/中止）与 confirm 提示：永远 stderr。
 *  - 每条命令收尾强制一条 footer()。
 */

const pc = require('picocolors');
const prompts = require('prompts');

const SYM = { ok: '✓', warn: '⚠', fail: '✗', step: '→', skip: '·' };
const PAINT = { ok: pc.green, warn: pc.yellow, fail: pc.red, step: pc.cyan, skip: pc.dim };

let _artifact = false;

/** 产物命令（sync/migrate）声明：人类输出降级到 stderr，stdout 留给 emit() 的机器产物。 */
function artifactMode(on = true) {
  _artifact = !!on;
}

/** 报告通道：人类命令→stdout；产物模式→stderr。 */
function reportStream() {
  return _artifact ? process.stderr : process.stdout;
}

function format(level, msg) {
  const paint = PAINT[level] || ((s) => s);
  return `${paint(SYM[level])} ${msg}`;
}

/** 报告通道的状态行（任意级别符号都属「报告数据」，doctor 的 ✗ 走这里而非 fail）。 */
function report(level, msg) {
  reportStream().write(format(level, msg) + '\n');
}

const ok = (msg) => report('ok', msg);
const warn = (msg) => report('warn', msg);
const step = (msg) => report('step', msg);
const skip = (msg) => reportStream().write(`${pc.dim(SYM.skip)} ${pc.dim(msg)}\n`);

/** 无符号的次要细节（路径、计数），缩进 + dim。 */
const muted = (msg) => reportStream().write(pc.dim('  ' + msg) + '\n');

/** 报告通道空行（页脚前留白）。 */
const blank = () => reportStream().write('\n');

/** 收尾页脚：加粗的「<符号> 结论」，走报告通道。 */
const footer = (level, msg) => reportStream().write(`${PAINT[level] ? PAINT[level](SYM[level]) : SYM[level]} ${pc.bold(msg)}\n`);

/** 操作级错误/中止：永远 stderr。 */
const fail = (msg) => process.stderr.write(format('fail', msg) + '\n');

/** 机器产物：永远 stdout（sync 的 patch / migrate 的改写）。 */
const emit = (data) => process.stdout.write(data);

/**
 * 破坏性操作二次确认。提示走 stderr（不污染被管道捕获的 stdout）。
 * @returns {Promise<'yes'|'no'|'non-interactive'>}
 *   yes = 放行（--yes 或用户确认）；no = 用户拒绝；non-interactive = 非 TTY 且无 --yes，调用方应报错退出。
 */
async function confirm(message, opts = {}) {
  if (opts.yes) return 'yes';
  if (!process.stdin.isTTY) return 'non-interactive';
  const res = await prompts(
    { type: 'confirm', name: 'ok', message, initial: false, stdout: process.stderr },
    { onCancel: () => {} }
  );
  return res.ok === true ? 'yes' : 'no';
}

/**
 * 文本输入（带默认值）。提示走 stderr（不污染被管道捕获的 stdout）。
 * 非交互（非 TTY）或 opts.yes → 直接回落默认值；用户回车空值/取消 → 同样回落默认值。
 * @returns {Promise<string>} 用户输入或默认值。
 */
async function ask(message, opts = {}) {
  const def = opts.default;
  if (opts.yes || !process.stdin.isTTY) return def;
  const res = await prompts(
    { type: 'text', name: 'val', message, initial: def, stdout: process.stderr },
    { onCancel: () => {} }
  );
  const v = typeof res.val === 'string' ? res.val.trim() : res.val;
  return v === undefined || v === '' ? def : v;
}

/**
 * 单选菜单（↑↓ 选，回车确定）。提示走 stderr。
 * 非交互（非 TTY）或 opts.yes → 直接回落默认值，不渲染菜单。
 * @param {Array<{title:string,value:*}>} choices
 * @returns {Promise<*>} 选中项的 value 或默认值。
 */
async function select(message, choices, opts = {}) {
  const def = opts.default;
  if (opts.yes || !process.stdin.isTTY) return def;
  const initial = Math.max(0, choices.findIndex((c) => c.value === def));
  const res = await prompts(
    { type: 'select', name: 'val', message, choices, initial, stdout: process.stderr },
    { onCancel: () => {} }
  );
  return res.val === undefined ? def : res.val;
}

module.exports = {
  artifactMode,
  report,
  ok,
  warn,
  step,
  skip,
  muted,
  blank,
  footer,
  fail,
  emit,
  confirm,
  ask,
  select,
  SYM,
};
