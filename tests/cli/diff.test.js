'use strict';

const { diffManifests, hasChanges } = require('../../lib/diff');

describe('lib/diff — diffManifests', () => {
  test('分类 added / removed / modified', () => {
    const base = { a: '1', b: '2', c: '3' };
    const curr = { a: '1', b: 'CHANGED', d: '4' }; // b 改, c 删, d 增
    expect(diffManifests(base, curr)).toEqual({
      added: ['d'],
      removed: ['c'],
      modified: ['b'],
    });
  });

  test('完全相同 → 三类皆空', () => {
    const m = { a: '1', b: '2' };
    expect(diffManifests(m, { ...m })).toEqual({ added: [], removed: [], modified: [] });
  });

  test('输出按路径排序（稳定）', () => {
    const d = diffManifests({}, { z: '1', a: '1', m: '1' });
    expect(d.added).toEqual(['a', 'm', 'z']);
  });

  test('hasChanges 反映是否有差异', () => {
    expect(hasChanges({ added: [], removed: [], modified: [] })).toBe(false);
    expect(hasChanges({ added: ['x'], removed: [], modified: [] })).toBe(true);
  });
});
