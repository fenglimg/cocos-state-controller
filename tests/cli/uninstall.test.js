'use strict';

/**
 * P3 dogfood：临时 consumer 装好后跑 computeUninstallPlan / applyUninstall。
 * 净荷源 = 源仓自身。测两段式纯函数：引用硬闸 / 移除分类 / dry-run / skills / 空目录 / 用户新增保留。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { install } = require('../../lib/commands/install');
const { skillInstall } = require('../../lib/commands/skill');
const { computeUninstallPlan, applyUninstall } = require('../../lib/commands/uninstall');
const { readLock, cscDir } = require('../../lib/lock');
const { compressUuid } = require('../../lib/cocos');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SC_CANONICAL = 'assets/script/controller/StateControllerV2.ts';
const SC_UUID = '931dc519-4e18-4197-843c-50af732e8be6';
const RUNTIME_DIR = 'assets/script/controller';

function makeConsumer() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'csc-uninstall-'));
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'project.json'), JSON.stringify({ engine: 'cocos2d-html5', version: '2.4.13' }));
  install({ payloadRoot: REPO_ROOT, targetRoot: root, packageVersion: '1.0.0' });
  return root;
}

describe('csc uninstall — computeUninstallPlan', () => {
  test('装好后：全部 managed 文件归 clean，无引用，安装目录将清空', () => {
    const c = makeConsumer();
    const plan = computeUninstallPlan(c, { payloadRoot: REPO_ROOT });
    const lock = readLock(c);
    expect(plan.referenced).toEqual([]);
    expect(plan.toDelete.clean.length).toBe(Object.keys(lock.files).length);
    expect(plan.toDelete.modified).toEqual([]);
    expect(plan.toDelete.clean).toContain(SC_CANONICAL);
    expect(plan.emptyDirs).toContain(RUNTIME_DIR);
    expect(plan.keptAdded).toEqual([]);
  });

  test('改过的文件归 modified（不归 clean）', () => {
    const c = makeConsumer();
    fs.appendFileSync(path.join(c, SC_CANONICAL), '\n// local edit\n');
    const plan = computeUninstallPlan(c, { payloadRoot: REPO_ROOT });
    expect(plan.toDelete.modified).toContain(SC_CANONICAL);
    expect(plan.toDelete.clean).not.toContain(SC_CANONICAL);
  });

  test('引用硬闸：prefab/scene 以 __type__ 引用组件 → referenced 非空', () => {
    const c = makeConsumer();
    const cu = compressUuid(SC_UUID);
    fs.writeFileSync(
      path.join(c, 'assets/MyScene.fire'),
      JSON.stringify([{ __type__: 'cc.SceneAsset' }, { __type__: cu, node: { __id__: 0 } }])
    );
    const plan = computeUninstallPlan(c, { payloadRoot: REPO_ROOT });
    expect(plan.referenced.length).toBeGreaterThan(0);
    expect(plan.referenced[0].file).toBe('assets/MyScene.fire');
    expect(plan.referenced[0].uuid).toBe(cu);
  });

  test('用户新增文件保留，且安装目录不再算空', () => {
    const c = makeConsumer();
    fs.writeFileSync(path.join(c, RUNTIME_DIR, 'MyExtra.ts'), 'export const x = 1;');
    const plan = computeUninstallPlan(c, { payloadRoot: REPO_ROOT });
    expect(plan.keptAdded).toContain(RUNTIME_DIR + '/MyExtra.ts');
    expect(plan.emptyDirs).not.toContain(RUNTIME_DIR);
  });

  test('skills：分发后默认列入移除；--keep-skill 则为空', () => {
    const c = makeConsumer();
    skillInstall({ packageRoot: REPO_ROOT, projectRoot: c, target: 'all' });
    expect(computeUninstallPlan(c, { payloadRoot: REPO_ROOT }).skills.length).toBeGreaterThan(0);
    expect(computeUninstallPlan(c, { payloadRoot: REPO_ROOT, keepSkill: true }).skills).toEqual([]);
  });

  test('未安装 → 抛错', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'csc-empty-'));
    expect(() => computeUninstallPlan(empty, { payloadRoot: REPO_ROOT })).toThrow(/未安装/);
  });
});

describe('csc uninstall — applyUninstall', () => {
  test('执行：删 managed 文件 + .csc + 回收空目录', () => {
    const c = makeConsumer();
    const plan = computeUninstallPlan(c, { payloadRoot: REPO_ROOT });
    const r = applyUninstall(plan, { targetRoot: c, payloadRoot: REPO_ROOT });
    expect(r.dryRun).toBe(false);
    expect(r.removed.length).toBe(plan.toDelete.clean.length + plan.toDelete.modified.length);
    expect(r.removedCsc).toBe(true);
    expect(fs.existsSync(path.join(c, SC_CANONICAL))).toBe(false);
    expect(fs.existsSync(cscDir(c))).toBe(false);
    expect(fs.existsSync(path.join(c, RUNTIME_DIR))).toBe(false);
  });

  test('dry-run：零副作用，lock 与文件都还在', () => {
    const c = makeConsumer();
    const plan = computeUninstallPlan(c, { payloadRoot: REPO_ROOT });
    const r = applyUninstall(plan, { targetRoot: c, payloadRoot: REPO_ROOT, dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(fs.existsSync(path.join(c, SC_CANONICAL))).toBe(true);
    expect(readLock(c)).not.toBeNull();
  });

  test('skills 分发后 applyUninstall 一并移除', () => {
    const c = makeConsumer();
    skillInstall({ packageRoot: REPO_ROOT, projectRoot: c, target: 'all' });
    const plan = computeUninstallPlan(c, { payloadRoot: REPO_ROOT });
    const r = applyUninstall(plan, { targetRoot: c, payloadRoot: REPO_ROOT });
    expect(r.removedSkills.length).toBeGreaterThan(0);
    for (const t of r.removedSkills) expect(fs.existsSync(path.join(c, t))).toBe(false);
  });

  test('用户新增文件在卸载后仍保留', () => {
    const c = makeConsumer();
    const extra = path.join(c, RUNTIME_DIR, 'MyExtra.ts');
    fs.writeFileSync(extra, 'export const x = 1;');
    const plan = computeUninstallPlan(c, { payloadRoot: REPO_ROOT });
    applyUninstall(plan, { targetRoot: c, payloadRoot: REPO_ROOT });
    expect(fs.existsSync(extra)).toBe(true);
  });
});
