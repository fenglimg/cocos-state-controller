'use strict';

/**
 * P6 migrate 包装：remote 安全门 + 引擎转发；skill install 分发。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { migrate, detectRemoteBundle, collectTargets, extractEngineError } = require('../../lib/commands/migrate');
const { skillInstall } = require('../../lib/commands/skill');
const { install } = require('../../lib/commands/install');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BIN = path.join(REPO_ROOT, 'bin/csc.js');

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

describe('migrate — 非默认安装目录 controllerDir（issue #3）', () => {
  test('runtime 装到非默认目录 + 传 controllerDir → 引擎找到 V2 meta 跑通', () => {
    const root = tmp('csc-cd-');
    fs.writeFileSync(path.join(root, 'project.json'), JSON.stringify({ engine: 'cocos2d-html5', version: '2.4.13' }));
    install({ payloadRoot: REPO_ROOT, targetRoot: root, packageVersion: '1.0.0', installPaths: { runtime: 'assets/custom/ctrl2', panel: 'packages/p' } });
    const f = path.join(root, 'assets/ui/Plain.prefab');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '[{"__type__":"cc.Node","_name":"plain"}]');

    // 不传 controllerDir → 引擎在写死候选里找不到 V2 meta → engine-error
    const miss = migrate({ targets: ['assets/ui/Plain.prefab'], projectRoot: root, packageRoot: REPO_ROOT });
    expect(miss.ok).toBe(false);
    expect(miss.reason).toBe('engine-error');
    expect(miss.engineError).toMatch(/StateControllerV2/);

    // 传 controllerDir（= lock 的 installPaths.runtime）→ 跑通
    const ok = migrate({ targets: ['assets/ui/Plain.prefab'], projectRoot: root, packageRoot: REPO_ROOT, controllerDir: 'assets/custom/ctrl2' });
    expect(ok.ok).toBe(true);
    expect(ok.output).toMatch(/summary/);
  });
});

describe('migrate — 干净错误（issue #5）', () => {
  test('不存在的目标 → reason no-targets，不跑引擎', () => {
    const root = tmp('csc-nt-');
    const r = migrate({ targets: ['assets/does-not-exist.prefab'], projectRoot: root, packageRoot: REPO_ROOT });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-targets');
    expect(r.ran).toBe(false);
  });

  test('引擎抛错 → reason engine-error + 单条可读原因（无堆栈裸抛）', () => {
    const root = tmp('csc-ee-');
    fs.writeFileSync(path.join(root, 'project.json'), JSON.stringify({ engine: 'cocos2d-html5', version: '2.4.13' }));
    install({ payloadRoot: REPO_ROOT, targetRoot: root, packageVersion: '1.0.0' });
    const f = path.join(root, 'assets/ui/Bad.prefab');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '{"not":"an array"}'); // 引擎要求根为数组 → 抛错
    const r = migrate({ targets: ['assets/ui/Bad.prefab'], projectRoot: root, packageRoot: REPO_ROOT });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('engine-error');
    expect(r.engineError).toMatch(/array/);
    expect(r.engineError).not.toMatch(/\n/); // 单条，非整栈
  });

  test('extractEngineError：取首个非 at 行，去 Error: 前缀', () => {
    expect(extractEngineError('Error: boom\n    at foo (x:1)\n    at bar (y:2)')).toBe('boom');
    expect(extractEngineError('', 'fallback')).toBe('fallback');
  });
});

describe('bin — 子命令 --help 短路（issue #4）', () => {
  test.each(['diff', 'install', 'uninstall', 'update', 'migrate'])('csc %s --help 打印用法且不执行命令', (cmd) => {
    const root = tmp('csc-help-');
    const out = execFileSync('node', [BIN, cmd, '--help'], { cwd: root, encoding: 'utf8' });
    expect(out).toMatch(new RegExp(`用法: csc ${cmd}`));
    // 未执行命令副作用：diff/uninstall 在未装工程会报「未安装」错误，这里不应出现
    expect(out).not.toMatch(/未安装|安装完成|卸载完成/);
    expect(fs.existsSync(path.join(root, '.csc'))).toBe(false);
  });

  test('csc install --yes --help 不触发安装（破坏性短路）', () => {
    const root = tmp('csc-help2-');
    fs.writeFileSync(path.join(root, 'project.json'), JSON.stringify({ engine: 'cocos2d-html5', version: '2.4.13' }));
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    const out = execFileSync('node', [BIN, 'install', '--yes', '--help'], { cwd: root, encoding: 'utf8' });
    expect(out).toMatch(/用法: csc install/);
    expect(fs.existsSync(path.join(root, '.csc/lock.json'))).toBe(false); // 没真装
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
