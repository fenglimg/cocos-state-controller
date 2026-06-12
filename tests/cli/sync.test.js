'use strict';

/**
 * P5 sync 集成测：装 vX 基线 → 本地改/删/增 → sync 输出 canonical 标签的 unified patch。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { install } = require('../../lib/commands/install');
const { sync } = require('../../lib/commands/sync');

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
function installBase(files, installPaths) {
  const baseRoot = makePayload(files);
  const consumer = makeConsumer();
  install({ payloadRoot: baseRoot, targetRoot: consumer, packageVersion: '1.0.0', installPaths });
  return { consumer, baseRoot };
}

describe('csc sync --upstream', () => {
  test('无本地改动 → 空 patch', () => {
    const { consumer, baseRoot } = installBase({ [`${CTRL}/A.ts`]: 'a\nb\n' });
    const r = sync({ targetRoot: consumer, basePayloadRoot: baseRoot });
    expect(r.hasChanges).toBe(false);
    expect(r.patch).toBe('');
  });

  test('本地改文件 → modified patch（canonical 标签 + +/- 行）', () => {
    const { consumer, baseRoot } = installBase({ [`${CTRL}/A.ts`]: 'a\nb\nc\n' });
    fs.writeFileSync(path.join(consumer, `${CTRL}/A.ts`), 'a\nB2\nc\n');
    const r = sync({ targetRoot: consumer, basePayloadRoot: baseRoot });

    expect(r.summary.modified).toBe(1);
    expect(r.patch).toContain(`--- a/${CTRL}/A.ts`);
    expect(r.patch).toContain(`+++ b/${CTRL}/A.ts`);
    expect(r.patch).toContain('-b');
    expect(r.patch).toContain('+B2');
  });

  test('本地删文件 → removed patch', () => {
    const { consumer, baseRoot } = installBase({ [`${CTRL}/A.ts`]: 'a\n', [`${CTRL}/Del.ts`]: 'x\ny\n' });
    fs.unlinkSync(path.join(consumer, `${CTRL}/Del.ts`));
    const r = sync({ targetRoot: consumer, basePayloadRoot: baseRoot });

    expect(r.summary.removed).toBe(1);
    const delChange = r.changes.find((c) => c.canonical === `${CTRL}/Del.ts`);
    expect(delChange.status).toBe('removed');
    expect(delChange.patch).toContain('-x');
  });

  test('本地新增 managed 文件 → added patch', () => {
    const { consumer, baseRoot } = installBase({ [`${CTRL}/A.ts`]: 'a\n' });
    fs.writeFileSync(path.join(consumer, `${CTRL}/New.ts`), 'brand\nnew\n');
    const r = sync({ targetRoot: consumer, basePayloadRoot: baseRoot });

    expect(r.summary.added).toBe(1);
    const addChange = r.changes.find((c) => c.canonical === `${CTRL}/New.ts`);
    expect(addChange.status).toBe('added');
    expect(addChange.patch).toContain('+brand');
  });

  test('自定义 installPaths → patch 标签仍是 canonical（反归一化生效）', () => {
    const ip = { runtime: 'src/vendor/scv2', panel: 'editor/scv2-panel' };
    const { consumer, baseRoot } = installBase({ [`${CTRL}/A.ts`]: 'a\nb\n' }, ip);
    fs.writeFileSync(path.join(consumer, 'src/vendor/scv2/A.ts'), 'a\nZ\n');
    const r = sync({ targetRoot: consumer, basePayloadRoot: baseRoot });

    expect(r.summary.modified).toBe(1);
    expect(r.patch).toContain(`a/${CTRL}/A.ts`); // canonical，非 src/vendor/scv2
    expect(r.patch).not.toContain('src/vendor/scv2');
  });

  test('未安装时抛错', () => {
    const consumer = makeConsumer();
    expect(() => sync({ targetRoot: consumer, basePayloadRoot: consumer })).toThrow(/未安装/);
  });
});
