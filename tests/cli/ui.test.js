'use strict';

/**
 * lib/ui.js 表现层单测：符号恒在 / stdout-stderr 流向 / confirm 守卫。
 * 颜色由 picocolors 按 NO_COLOR/TTY/CI 自动开关（CI 下会开色），故不断言颜色码有无。
 */

const ui = require('../../lib/ui');
const prompts = require('prompts');

function capture(fn) {
  const out = [];
  const err = [];
  const o = process.stdout.write;
  const e = process.stderr.write;
  process.stdout.write = (s) => (out.push(String(s)), true);
  process.stderr.write = (s) => (err.push(String(s)), true);
  try {
    fn();
  } finally {
    process.stdout.write = o;
    process.stderr.write = e;
  }
  return { out: out.join(''), err: err.join('') };
}

afterEach(() => ui.artifactMode(false)); // 复位模块态

describe('lib/ui 符号与流向', () => {
  test('人类命令：ok/报告走 stdout，含 ✓ 符号', () => {
    const { out, err } = capture(() => ui.ok('done'));
    expect(out).toContain('✓');
    expect(out).toContain('done');
    expect(err).toBe('');
  });

  test('fail 永远走 stderr，不进 stdout', () => {
    const { out, err } = capture(() => ui.fail('boom'));
    expect(err).toContain('✗');
    expect(err).toContain('boom');
    expect(out).toBe('');
  });

  test('产物模式：人类输出降级到 stderr', () => {
    const { out, err } = capture(() => {
      ui.artifactMode();
      ui.ok('status');
    });
    expect(err).toContain('status');
    expect(out).toBe('');
  });

  test('emit 永远走 stdout（机器产物）', () => {
    const { out, err } = capture(() => {
      ui.artifactMode();
      ui.emit('PATCH-DATA');
    });
    expect(out).toBe('PATCH-DATA');
    expect(err).toBe('');
  });

  test('符号始终存在（颜色由 picocolors 按环境开关，不在此断言）', () => {
    const { out } = capture(() => ui.ok('x'));
    expect(out).toContain('✓');
  });
});

describe('lib/ui confirm 守卫', () => {
  test('{yes:true} → 直接 yes，不弹提示', async () => {
    expect(await ui.confirm('删？', { yes: true })).toBe('yes');
  });

  test('非交互（jest 无 TTY stdin） → non-interactive', async () => {
    expect(await ui.confirm('删？')).toBe('non-interactive');
  });
});

describe('lib/ui ask 守卫', () => {
  test('{yes:true} → 直接回落默认值，不弹提示', async () => {
    expect(await ui.ask('装到哪？', { yes: true, default: 'assets/x' })).toBe('assets/x');
  });

  test('非交互（jest 无 TTY stdin） → 回落默认值', async () => {
    expect(await ui.ask('装到哪？', { default: 'assets/y' })).toBe('assets/y');
  });
});

describe('lib/ui select 守卫', () => {
  const choices = [
    { title: 'a', value: 'assets/a' },
    { title: 'b', value: 'assets/b' },
  ];

  test('{yes:true} → 直接回落默认值，不渲染菜单', async () => {
    expect(await ui.select('选？', choices, { yes: true, default: 'assets/b' })).toBe('assets/b');
  });

  test('非交互（jest 无 TTY stdin） → 回落默认值', async () => {
    expect(await ui.select('选？', choices, { default: 'assets/a' })).toBe('assets/a');
  });
});

// 交互分支真覆盖：伪造 TTY + prompts.inject 注入用户答案（不依赖真终端 keypress）。
describe('lib/ui 交互分支（prompts.inject 驱动）', () => {
  const choices = [
    { title: 'a', value: 'assets/a' },
    { title: 'b', value: 'assets/b' },
  ];
  let restore;
  beforeEach(() => {
    const had = Object.prototype.hasOwnProperty.call(process.stdin, 'isTTY');
    const prev = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    restore = () => {
      if (had) Object.defineProperty(process.stdin, 'isTTY', { value: prev, configurable: true });
      else delete process.stdin.isTTY;
    };
  });
  afterEach(() => restore());

  test('select 返回选中项的 value', async () => {
    prompts.inject(['assets/b']);
    expect(await ui.select('选？', choices, { default: 'assets/a' })).toBe('assets/b');
  });

  test('select 选「自定义」哨兵 → ask 接管返回输入值', async () => {
    prompts.inject(['__custom__', 'assets/my/dir']);
    const picked = await ui.select('选？', [...choices, { title: '自定义', value: '__custom__' }], { default: 'assets/a' });
    expect(picked).toBe('__custom__');
    expect(await ui.ask('输入：', { default: 'assets/a' })).toBe('assets/my/dir');
  });

  test('ask 空输入 → 回落默认值', async () => {
    prompts.inject(['']);
    expect(await ui.ask('输入：', { default: 'assets/a' })).toBe('assets/a');
  });
});
