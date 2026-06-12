'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { reconstructBaseline, tarExtract } = require('../../lib/baseline');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('lib/baseline — reconstructBaseline 编排', () => {
  test('依次调 fetchTarball → extract，返回净荷根', () => {
    const calls = [];
    const fetchTarball = (pkg, version, dir) => {
      calls.push(['fetch', pkg, version, dir]);
      return path.join(dir, 'pkg.tgz');
    };
    const extract = (tarball, dir) => {
      calls.push(['extract', tarball, dir]);
      return path.join(dir, 'package');
    };
    const root = reconstructBaseline({
      pkg: '@fenglimg/cocos-state-controller',
      version: '1.0.0',
      workDir: '/work',
      fetchTarball,
      extract,
    });
    expect(root).toBe(path.join('/work', 'package'));
    expect(calls).toEqual([
      ['fetch', '@fenglimg/cocos-state-controller', '1.0.0', '/work'],
      ['extract', path.join('/work', 'pkg.tgz'), '/work'],
    ]);
  });
});

describe('lib/baseline — 默认 tarExtract（真实 tar）', () => {
  test('解出 package/ 下净荷内容', () => {
    // 当场打一个 npm 风格 tarball：package/ 下放文件
    const srcParent = tmp('csc-src-');
    const pkgDir = path.join(srcParent, 'package');
    fs.mkdirSync(path.join(pkgDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'a.js'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(pkgDir, 'sub', 'b.txt'), 'hello\n');

    const tarball = path.join(srcParent, 'fixture.tgz');
    execFileSync('tar', ['-czf', tarball, '-C', srcParent, 'package']);

    const work = tmp('csc-work-');
    const root = tarExtract(tarball, work);

    expect(root).toBe(path.join(work, 'package'));
    expect(fs.readFileSync(path.join(root, 'a.js'), 'utf8')).toBe('export const a = 1;\n');
    expect(fs.readFileSync(path.join(root, 'sub', 'b.txt'), 'utf8')).toBe('hello\n');
  });
});
