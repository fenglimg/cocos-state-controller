'use strict';

const { merge3 } = require('../../lib/merge3');

describe('lib/merge3 — 快速路径', () => {
  test('ours==theirs → 无冲突取其一', () => {
    const r = merge3('base', 'same', 'same');
    expect(r).toEqual({ conflict: false, content: 'same' });
  });

  test('本地没动（ours==base）→ 取新版 theirs', () => {
    const r = merge3('base', 'base', 'newver');
    expect(r).toEqual({ conflict: false, content: 'newver' });
  });

  test('上游没动（theirs==base）→ 保留本地 ours', () => {
    const r = merge3('base', 'local', 'base');
    expect(r).toEqual({ conflict: false, content: 'local' });
  });
});

describe('lib/merge3 — git diff3', () => {
  test('两边改不同行（无重叠）→ 自动并，无冲突', () => {
    const base = 'a\nb\nc\nd\ne\n';
    const ours = 'A\nb\nc\nd\ne\n'; // 改首行
    const theirs = 'a\nb\nc\nd\nE\n'; // 改末行
    const r = merge3(base, ours, theirs);
    expect(r.conflict).toBe(false);
    expect(r.content).toBe('A\nb\nc\nd\nE\n');
  });

  test('两边改同一行 → 冲突，打 <<<< 标记', () => {
    const base = 'a\nb\nc\n';
    const ours = 'a\nX\nc\n';
    const theirs = 'a\nY\nc\n';
    const r = merge3(base, ours, theirs);
    expect(r.conflict).toBe(true);
    expect(r.content).toContain('<<<<<<<');
    expect(r.content).toContain('=======');
    expect(r.content).toContain('>>>>>>>');
    expect(r.content).toContain('X');
    expect(r.content).toContain('Y');
  });

  test('自定义冲突标签', () => {
    const r = merge3('a\nb\n', 'a\nX\n', 'a\nY\n', {
      oursLabel: 'consumer',
      theirsLabel: 'v2.0',
    });
    expect(r.content).toContain('<<<<<<< consumer');
    expect(r.content).toContain('>>>>>>> v2.0');
  });
});
