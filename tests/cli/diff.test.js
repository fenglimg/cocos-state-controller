'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { diffManifests, hasChanges } = require('../../lib/diff');
const { install } = require('../../lib/commands/install');
const { diffInstalled } = require('../../lib/commands/diff');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = 'assets/script/controller';
const SC_CANONICAL = 'assets/script/controller/StateControllerV2.ts';

function makeConsumer() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'csc-diff-'));
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'project.json'), JSON.stringify({ engine: 'cocos2d-html5', version: '2.4.13' }));
  install({ payloadRoot: REPO_ROOT, targetRoot: root, packageVersion: '1.0.0' });
  return root;
}

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

describe('csc diff — diffInstalled (e2e)', () => {
  test('刚装好 → 三类皆空', () => {
    const c = makeConsumer();
    expect(diffInstalled(c)).toEqual({ added: [], removed: [], modified: [] });
  });

  test('安装目录里新增 lock 未记录的文件 → 计入 added（与 sync 口径一致）', () => {
    const c = makeConsumer();
    fs.writeFileSync(path.join(c, RUNTIME_DIR, 'MyExtra.ts'), 'export const x = 1;');
    const d = diffInstalled(c);
    expect(d.added).toContain(RUNTIME_DIR + '/MyExtra.ts');
    expect(d.modified).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  test('同时存在 modified / removed / added 三态', () => {
    const c = makeConsumer();
    fs.appendFileSync(path.join(c, SC_CANONICAL), '\n// local edit\n');
    fs.rmSync(path.join(c, RUNTIME_DIR, 'StateSelectV2.ts'));
    fs.writeFileSync(path.join(c, RUNTIME_DIR, 'New.ts'), 'export const y = 2;');
    const d = diffInstalled(c);
    expect(d.modified).toContain(SC_CANONICAL);
    expect(d.removed).toContain(RUNTIME_DIR + '/StateSelectV2.ts');
    expect(d.added).toContain(RUNTIME_DIR + '/New.ts');
  });
});
