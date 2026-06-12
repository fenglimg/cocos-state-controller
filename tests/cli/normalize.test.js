'use strict';

const {
  CANONICAL,
  normalizeContent,
  normalizePath,
  denormalizePath,
} = require('../../lib/normalize');

describe('lib/normalize — 内容归一化', () => {
  test('CRLF 与 CR 都归一到 LF', () => {
    expect(normalizeContent('a\r\nb\rc\n')).toBe('a\nb\nc\n');
  });

  test('已是 LF 的内容不变', () => {
    expect(normalizeContent('a\nb\n')).toBe('a\nb\n');
  });

  test('接受 Buffer 输入', () => {
    expect(normalizeContent(Buffer.from('x\r\ny'))).toBe('x\ny');
  });
});

describe('lib/normalize — 文件路径 canonical 互转', () => {
  const installPaths = {
    runtime: 'src/vendor/controller',
    panel: 'editor/scv2-panel',
  };

  test('安装路径 → canonical', () => {
    expect(normalizePath('src/vendor/controller/StateControllerV2.ts', installPaths))
      .toBe(CANONICAL.runtime + '/StateControllerV2.ts');
    expect(normalizePath('editor/scv2-panel/panel/logic.js', installPaths))
      .toBe(CANONICAL.panel + '/panel/logic.js');
  });

  test('canonical → 安装路径（逆映射）', () => {
    expect(denormalizePath(CANONICAL.runtime + '/StateControllerV2.ts', installPaths))
      .toBe('src/vendor/controller/StateControllerV2.ts');
  });

  test('normalize→denormalize round-trip 还原', () => {
    const p = 'src/vendor/controller/capabilities/index.ts';
    expect(denormalizePath(normalizePath(p, installPaths), installPaths)).toBe(p);
  });

  test('安装位置 == canonical（默认布局）时为恒等', () => {
    const def = { runtime: CANONICAL.runtime, panel: CANONICAL.panel };
    const p = CANONICAL.runtime + '/Capability.ts';
    expect(normalizePath(p, def)).toBe(p);
    expect(denormalizePath(p, def)).toBe(p);
  });

  test('不匹配任何安装前缀的路径原样返回', () => {
    expect(normalizePath('README.md', installPaths)).toBe('README.md');
  });

  test('Windows 反斜杠分隔符归一为 posix', () => {
    expect(normalizePath('src\\vendor\\controller\\X.ts', installPaths))
      .toBe(CANONICAL.runtime + '/X.ts');
  });

  test('installPaths 缺省时仅做 posix 归一', () => {
    expect(normalizePath('a\\b', null)).toBe('a/b');
  });
});
