'use strict';

/**
 * P3 dogfood：在临时 consumer 工程上跑 install → diff → doctor，净荷源 = 源仓自身。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { install } = require('../../lib/commands/install');
const { diffInstalled } = require('../../lib/commands/diff');
const { doctor } = require('../../lib/commands/doctor');
const { readLock } = require('../../lib/lock');

const REPO_ROOT = path.resolve(__dirname, '..', '..'); // 源仓根 = 净荷源
const BIN = path.join(REPO_ROOT, 'bin/csc.js');
const SC_CANONICAL = 'assets/script/controller/StateControllerV2.ts';
const SC_META_UUID = '931dc519-4e18-4197-843c-50af732e8be6';

function makeConsumer() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'csc-consumer-'));
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'project.json'),
    JSON.stringify({ engine: 'cocos2d-html5', version: '2.4.13' })
  );
  return root;
}

describe('csc install (dogfood)', () => {
  test('拷 runtime+panel + 写 lock + 保留 canonical .meta + 探测 Cocos 版本', () => {
    const consumer = makeConsumer();
    const r = install({ payloadRoot: REPO_ROOT, targetRoot: consumer, packageVersion: '1.0.0' });

    expect(r.collisions).toEqual([]);
    expect(r.copied.length).toBeGreaterThan(10);

    const lock = readLock(consumer);
    expect(lock.packageVersion).toBe('1.0.0');
    expect(Object.keys(lock.files).length).toBe(r.copied.length);
    expect(Object.keys(lock.files)).toContain(SC_CANONICAL);

    expect(fs.existsSync(path.join(consumer, SC_CANONICAL))).toBe(true);
    const meta = JSON.parse(fs.readFileSync(path.join(consumer, SC_CANONICAL + '.meta'), 'utf8'));
    expect(meta.uuid).toBe(SC_META_UUID); // canonical uuid 原样保留

    expect(r.cocos.version).toBe('2.4.13');
    expect(r.cocosSupported).toBe(true);
  });

  test('uuid 撞车预检：异文件占用包 uuid → 中止不拷不写 lock', () => {
    const consumer = makeConsumer();
    fs.mkdirSync(path.join(consumer, 'assets/foreign'), { recursive: true });
    fs.writeFileSync(
      path.join(consumer, 'assets/foreign/Other.ts.meta'),
      JSON.stringify({ uuid: SC_META_UUID })
    );
    const r = install({ payloadRoot: REPO_ROOT, targetRoot: consumer, packageVersion: '1.0.0' });
    expect(r.collisions.length).toBeGreaterThan(0);
    expect(r.copied).toEqual([]);
    expect(readLock(consumer)).toBeNull();
  });

  test('bin install 默认随装分发 skill → .claude/.codex（--no-skill 关）', () => {
    const consumer = makeConsumer();
    execFileSync('node', [BIN, 'install'], { cwd: consumer, encoding: 'utf8' });
    expect(fs.existsSync(path.join(consumer, '.claude/skills/cocos-state-controller/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(consumer, '.codex/skills/cocos-state-controller/SKILL.md'))).toBe(true);

    const noSkill = makeConsumer();
    execFileSync('node', [BIN, 'install', '--no-skill'], { cwd: noSkill, encoding: 'utf8' });
    expect(fs.existsSync(path.join(noSkill, '.claude'))).toBe(false);
    expect(fs.existsSync(path.join(noSkill, '.codex'))).toBe(false);
    expect(readLock(noSkill)).not.toBeNull(); // 关 skill 不影响净荷安装
  });

  test('自定义 installPaths：文件落自定义位置，lock.files key 仍 canonical', () => {
    const consumer = makeConsumer();
    install({
      payloadRoot: REPO_ROOT,
      targetRoot: consumer,
      packageVersion: '1.0.0',
      installPaths: { runtime: 'src/vendor/scv2', panel: 'editor/scv2-panel' },
    });
    expect(fs.existsSync(path.join(consumer, 'src/vendor/scv2/StateControllerV2.ts'))).toBe(true);
    expect(Object.keys(readLock(consumer).files)).toContain(SC_CANONICAL);
    expect(diffInstalled(consumer)).toEqual({ added: [], removed: [], modified: [] });
  });
});

describe('csc diff (dogfood)', () => {
  test('装完无改动→空；改文件→modified；删文件→removed', () => {
    const consumer = makeConsumer();
    install({ payloadRoot: REPO_ROOT, targetRoot: consumer, packageVersion: '1.0.0' });
    expect(diffInstalled(consumer)).toEqual({ added: [], removed: [], modified: [] });

    fs.appendFileSync(path.join(consumer, SC_CANONICAL), '\n// local edit\n');
    expect(diffInstalled(consumer).modified).toContain(SC_CANONICAL);

    fs.unlinkSync(path.join(consumer, SC_CANONICAL));
    expect(diffInstalled(consumer).removed).toContain(SC_CANONICAL);
  });

  test('未安装时抛错', () => {
    const consumer = makeConsumer();
    expect(() => diffInstalled(consumer)).toThrow(/未安装/);
  });
});

describe('csc doctor (dogfood)', () => {
  test('装完无 fail；删文件→files-present fail', () => {
    const consumer = makeConsumer();
    install({ payloadRoot: REPO_ROOT, targetRoot: consumer, packageVersion: '1.0.0' });

    const ok = doctor(consumer);
    expect(ok.ok).toBe(true);
    expect(ok.checks.find((c) => c.name === 'cocos-version').status).toBe('ok');
    expect(ok.checks.find((c) => c.name === 'lock-consistency').status).toBe('ok');

    fs.unlinkSync(path.join(consumer, SC_CANONICAL));
    const bad = doctor(consumer);
    expect(bad.ok).toBe(false);
    expect(bad.checks.find((c) => c.name === 'files-present').status).toBe('fail');
  });

  test('本地改动→lock-consistency warn（非 fail）', () => {
    const consumer = makeConsumer();
    install({ payloadRoot: REPO_ROOT, targetRoot: consumer, packageVersion: '1.0.0' });
    fs.appendFileSync(path.join(consumer, SC_CANONICAL), '\n// edit\n');
    const r = doctor(consumer);
    expect(r.ok).toBe(true);
    expect(r.checks.find((c) => c.name === 'lock-consistency').status).toBe('warn');
  });
});
