'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const lock = require('../../lib/lock');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'csc-lock-'));
}

describe('lib/lock', () => {
  test('未安装时 readLock 返回 null', () => {
    const root = tmpRoot();
    expect(lock.readLock(root)).toBeNull();
  });

  test('writeLock 建 .csc/ 目录并 round-trip', () => {
    const root = tmpRoot();
    const data = {
      packageVersion: '1.0.0',
      installPaths: { runtime: 'assets/script/controller', panel: 'packages/state-controller-v2-panel' },
      files: { 'assets/script/controller/StateControllerV2.ts': 'abc123' },
    };
    const written = lock.writeLock(root, data);
    expect(written).toBe(path.join(root, '.csc', 'lock.json'));
    expect(fs.existsSync(written)).toBe(true);
    expect(lock.readLock(root)).toEqual(data);
  });

  test('lock.json 稳定序列化：2 空格缩进 + 末尾换行', () => {
    const root = tmpRoot();
    lock.writeLock(root, { packageVersion: '1.0.0', installPaths: {}, files: {} });
    const raw = fs.readFileSync(lock.lockPath(root), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('\n  "packageVersion"');
  });

  test('lockPath / cscDir 指向 .csc/lock.json', () => {
    const root = '/proj';
    expect(lock.cscDir(root)).toBe(path.join('/proj', '.csc'));
    expect(lock.lockPath(root)).toBe(path.join('/proj', '.csc', 'lock.json'));
  });
});
