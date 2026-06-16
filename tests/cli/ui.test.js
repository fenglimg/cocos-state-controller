'use strict';

/**
 * lib/ui.js 表现层单测：符号恒在 / stdout-stderr 流向 / confirm 守卫。
 * 颜色由 picocolors 按 NO_COLOR/TTY/CI 自动开关（CI 下会开色），故不断言颜色码有无。
 */

const ui = require('../../lib/ui');

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
