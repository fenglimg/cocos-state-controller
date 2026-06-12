'use strict';

/**
 * P4 update 集成测：最小 fixture 净荷（vX/vY）+ 临时 consumer，覆盖三方决策四桶 + 移除 + lock 更新。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { install } = require('../../lib/commands/install');
const { update } = require('../../lib/commands/update');
const { readLock } = require('../../lib/lock');

const CTRL = 'assets/script/controller';
const MIN_MANIFEST = {
  version: 1,
  targetMappings: [
    { name: 'controller-v2', source: 'assets/script/controller', target: 'assets/script/controller', includeMeta: true },
    { name: 'editor-panel', source: 'packages/state-controller-v2-panel', target: 'packages/state-controller-v2-panel', exclude: ['.fabric'] },
  ],
};

function tmp(p) {
  return fs.mkdtempSync(path.join(os.tmpdir(), p));
}

/** 造最小净荷：写 manifest + 给定 canonical 文件。 */
function makePayload(files) {
  const root = tmp('csc-payload-');
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools/state-controller-sync-manifest.json'), JSON.stringify(MIN_MANIFEST));
  for (const [rel, content] of Object.entries(files)) {
    const fp = path.join(root, rel);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content);
  }
  return root;
}

function makeConsumer() {
  const root = tmp('csc-consumer-');
  fs.writeFileSync(path.join(root, 'project.json'), JSON.stringify({ engine: 'cocos2d-html5', version: '2.4.13' }));
  return root;
}

/** 装 vX 基线到 consumer，返回 { consumer, baseRoot }。 */
function installBase(files) {
  const baseRoot = makePayload(files);
  const consumer = makeConsumer();
  install({ payloadRoot: baseRoot, targetRoot: consumer, packageVersion: '1.0.0' });
  return { consumer, baseRoot };
}

describe('csc update — 三方决策', () => {
  test('没动过的文件 → clean 覆盖成 vY，lock 升版', () => {
    const { consumer, baseRoot } = installBase({ [`${CTRL}/A.ts`]: 'a\nb\nc\n' });
    const newRoot = makePayload({ [`${CTRL}/A.ts`]: 'a\nB2\nc\n' });
    const r = update({ targetRoot: consumer, basePayloadRoot: baseRoot, newPayloadRoot: newRoot, newVersion: '2.0.0' });

    expect(r.results.clean).toContain(`${CTRL}/A.ts`);
    expect(r.hasConflict).toBe(false);
    expect(fs.readFileSync(path.join(consumer, `${CTRL}/A.ts`), 'utf8')).toBe('a\nB2\nc\n');
    expect(readLock(consumer).packageVersion).toBe('2.0.0');
  });

  test('本地改过 + 改动不重叠 → merged 自动并，无冲突', () => {
    const { consumer, baseRoot } = installBase({ [`${CTRL}/A.ts`]: 'a\nb\nc\n' });
    // 本地改 line1
    fs.writeFileSync(path.join(consumer, `${CTRL}/A.ts`), 'A1\nb\nc\n');
    // vY 改 line3
    const newRoot = makePayload({ [`${CTRL}/A.ts`]: 'a\nb\nC3\n' });
    const r = update({ targetRoot: consumer, basePayloadRoot: baseRoot, newPayloadRoot: newRoot, newVersion: '2.0.0' });

    expect(r.results.merged).toContain(`${CTRL}/A.ts`);
    expect(r.hasConflict).toBe(false);
    expect(fs.readFileSync(path.join(consumer, `${CTRL}/A.ts`), 'utf8')).toBe('A1\nb\nC3\n');
  });

  test('本地改过 + 改同一行 → conflict 打 <<<< 标记', () => {
    const { consumer, baseRoot } = installBase({ [`${CTRL}/A.ts`]: 'a\nb\nc\n' });
    fs.writeFileSync(path.join(consumer, `${CTRL}/A.ts`), 'a\nXX\nc\n');
    const newRoot = makePayload({ [`${CTRL}/A.ts`]: 'a\nYY\nc\n' });
    const r = update({ targetRoot: consumer, basePayloadRoot: baseRoot, newPayloadRoot: newRoot, newVersion: '2.0.0' });

    expect(r.results.conflict).toContain(`${CTRL}/A.ts`);
    expect(r.hasConflict).toBe(true);
    const merged = fs.readFileSync(path.join(consumer, `${CTRL}/A.ts`), 'utf8');
    expect(merged).toContain('<<<<<<<');
    expect(merged).toContain('>>>>>>> v2.0.0');
  });

  test('vY 移除的 managed 文件 → 从 consumer 删除', () => {
    const { consumer, baseRoot } = installBase({ [`${CTRL}/A.ts`]: 'a\n', [`${CTRL}/Gone.ts`]: 'old\n' });
    const newRoot = makePayload({ [`${CTRL}/A.ts`]: 'a\n' }); // 不含 Gone.ts
    const r = update({ targetRoot: consumer, basePayloadRoot: baseRoot, newPayloadRoot: newRoot, newVersion: '2.0.0' });

    expect(r.results.removed).toContain(`${CTRL}/Gone.ts`);
    expect(fs.existsSync(path.join(consumer, `${CTRL}/Gone.ts`))).toBe(false);
    expect(readLock(consumer).files[`${CTRL}/Gone.ts`]).toBeUndefined();
  });

  test('vY 新增的 managed 文件 → added 写入 consumer', () => {
    const { consumer, baseRoot } = installBase({ [`${CTRL}/A.ts`]: 'a\n' });
    const newRoot = makePayload({ [`${CTRL}/A.ts`]: 'a\n', [`${CTRL}/New.ts`]: 'fresh\n' });
    const r = update({ targetRoot: consumer, basePayloadRoot: baseRoot, newPayloadRoot: newRoot, newVersion: '2.0.0' });

    expect(r.results.added).toContain(`${CTRL}/New.ts`);
    expect(fs.readFileSync(path.join(consumer, `${CTRL}/New.ts`), 'utf8')).toBe('fresh\n');
  });

  test('dryRun 不落盘但报告决策', () => {
    const { consumer, baseRoot } = installBase({ [`${CTRL}/A.ts`]: 'a\nb\nc\n' });
    const newRoot = makePayload({ [`${CTRL}/A.ts`]: 'a\nB2\nc\n' });
    const r = update({ targetRoot: consumer, basePayloadRoot: baseRoot, newPayloadRoot: newRoot, newVersion: '2.0.0', dryRun: true });

    expect(r.results.clean).toContain(`${CTRL}/A.ts`);
    expect(r.lockPath).toBeNull();
    expect(fs.readFileSync(path.join(consumer, `${CTRL}/A.ts`), 'utf8')).toBe('a\nb\nc\n'); // 未改
    expect(readLock(consumer).packageVersion).toBe('1.0.0'); // lock 未升
  });

  test('未安装时抛错', () => {
    const consumer = makeConsumer();
    const newRoot = makePayload({ [`${CTRL}/A.ts`]: 'a\n' });
    expect(() => update({ targetRoot: consumer, basePayloadRoot: newRoot, newPayloadRoot: newRoot })).toThrow(/未安装/);
  });
});
