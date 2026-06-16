'use strict';

/**
 * P6 migrate 包装：remote 安全门 + 引擎转发；skill install 分发。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { migrate, detectRemoteBundle, collectTargets } = require('../../lib/commands/migrate');
const { skillInstall } = require('../../lib/commands/skill');
const { install } = require('../../lib/commands/install');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function tmp(p) {
  return fs.mkdtempSync(path.join(os.tmpdir(), p));
}

describe('migrate — detectRemoteBundle', () => {
  test('路径含 RemoteBundles/ → remote', () => {
    const root = tmp('csc-rb-');
    const f = path.join(root, 'assets/RemoteBundles/sub/x.prefab');
    expect(detectRemoteBundle(f, root).remote).toBe(true);
  });

  test('祖先目录 bundle meta 标 isRemote → remote', () => {
    const root = tmp('csc-rb-');
    fs.mkdirSync(path.join(root, 'assets/hot'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets/hot.meta'), JSON.stringify({ isBundle: true, isRemote: true }));
    const f = path.join(root, 'assets/hot/x.prefab');
    fs.writeFileSync(f, '[]');
    expect(detectRemoteBundle(f, root).remote).toBe(true);
  });

  test('local bundle（isBundle 但非 remote）→ 不拦', () => {
    const root = tmp('csc-rb-');
    fs.mkdirSync(path.join(root, 'assets/local'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets/local.meta'), JSON.stringify({ isBundle: true, isRemote: false }));
    const f = path.join(root, 'assets/local/x.prefab');
    fs.writeFileSync(f, '[]');
    expect(detectRemoteBundle(f, root).remote).toBe(false);
  });

  test('普通路径 → 不 remote', () => {
    const root = tmp('csc-rb-');
    expect(detectRemoteBundle(path.join(root, 'assets/ui/x.prefab'), root).remote).toBe(false);
  });
});

describe('migrate — collectTargets', () => {
  test('展开目录 + 只收 .prefab/.fire', () => {
    const root = tmp('csc-ct-');
    fs.mkdirSync(path.join(root, 'a/b'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a/x.prefab'), '[]');
    fs.writeFileSync(path.join(root, 'a/b/y.fire'), '[]');
    fs.writeFileSync(path.join(root, 'a/z.ts'), 'x'); // 忽略
    const got = collectTargets(['a'], root).map((p) => path.relative(root, p)).sort();
    expect(got).toEqual([path.join('a', 'b', 'y.fire'), path.join('a', 'x.prefab')].sort());
  });
});

describe('migrate — remote 安全门', () => {
  test('remote prefab 默认拒绝（不跑引擎）', () => {
    const root = tmp('csc-mg-');
    const f = path.join(root, 'assets/RemoteBundles/x.prefab');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '[]');
    const r = migrate({ targets: ['assets/RemoteBundles/x.prefab'], projectRoot: root, packageRoot: REPO_ROOT, dryRunEngine: true });
    expect(r.ok).toBe(false);
    expect(r.ran).toBe(false);
    expect(r.blocked.length).toBe(1);
  });

  test('--allow-remote 放行 remote prefab', () => {
    const root = tmp('csc-mg-');
    const f = path.join(root, 'assets/RemoteBundles/x.prefab');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '[]');
    const r = migrate({ targets: ['assets/RemoteBundles/x.prefab'], projectRoot: root, packageRoot: REPO_ROOT, allowRemote: true, dryRunEngine: true });
    expect(r.ok).toBe(true);
    expect(r.blocked.length).toBe(1); // 仍记录但放行
  });
});

describe('migrate — 引擎集成（dry-run，源仓 .fire）', () => {
  test('调真引擎跑通源仓场景文件，dry-run 不改盘', () => {
    const r = migrate({ targets: ['assets/scene'], projectRoot: REPO_ROOT, packageRoot: REPO_ROOT, write: false });
    expect(r.ok).toBe(true);
    expect(r.ran).toBe(true);
    expect(r.output).toMatch(/summary/);
  });

  test('无可迁移内容的 prefab（仅格式与 JSON.stringify 不同）→ changedFiles=0', () => {
    // 纯格式差异（紧凑 JSON ↔ 2 空格缩进）不得误判 changed，否则 --write 会无谓重排整份 prefab。
    // 先 install 铺 runtime（引擎 createTypeMap 需 controller V2 .meta 推 cid），再放紧凑 prefab。
    const root = tmp('csc-fmt-');
    fs.writeFileSync(path.join(root, 'project.json'), JSON.stringify({ engine: 'cocos2d-html5', version: '2.4.13' }));
    install({ payloadRoot: REPO_ROOT, targetRoot: root, packageVersion: '1.0.0' });
    const f = path.join(root, 'assets/ui/Plain.prefab');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '[{"__type__":"cc.Node","_name":"plain"}]'); // 无 V1 控制器 + 紧凑格式
    const r = migrate({ targets: ['assets/ui/Plain.prefab'], projectRoot: root, packageRoot: REPO_ROOT, write: false });
    expect(r.ok).toBe(true);
    expect(r.output).toMatch(/changedFiles=0/);
  });
});

describe('skill install', () => {
  test('--target all → 落 .claude + .codex（含 refs，收敛后仅 1 skill）', () => {
    const proj = tmp('csc-sk-');
    const r = skillInstall({ packageRoot: REPO_ROOT, projectRoot: proj, target: 'all' });
    expect(r.installed.some((t) => t.includes('.claude'))).toBe(true);
    expect(r.installed.some((t) => t.includes('.codex'))).toBe(true);
    expect(r.installed.length).toBe(2); // 单一 router skill × 2 target
    expect(fs.existsSync(path.join(proj, '.claude/skills/cocos-state-controller/SKILL.md'))).toBe(true);
    // refs/ 子目录随 copyDir 递归分发
    expect(fs.existsSync(path.join(proj, '.codex/skills/cocos-state-controller/refs/editor-guide.md'))).toBe(true);
  });

  test('--target claude → 只落 .claude', () => {
    const proj = tmp('csc-sk-');
    const r = skillInstall({ packageRoot: REPO_ROOT, projectRoot: proj, target: 'claude' });
    expect(r.installed.every((t) => t.includes('.claude'))).toBe(true);
    expect(fs.existsSync(path.join(proj, '.codex'))).toBe(false);
  });
});
