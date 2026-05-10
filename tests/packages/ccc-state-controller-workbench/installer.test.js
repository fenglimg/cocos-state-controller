'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const installer = require('../../../packages/ccc-state-controller-workbench/lib/installer');

function mkTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function rmDir(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

describe('lib/installer', () => {
    let scratch;

    beforeEach(() => {
        scratch = mkTempDir('installer-test');
    });

    afterEach(() => {
        rmDir(scratch);
    });

    test('listRuntimeFiles only matches .ts and .meta', () => {
        const dir = path.join(scratch, 'src');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'a.ts'), 'export {};');
        fs.writeFileSync(path.join(dir, 'a.ts.meta'), '{}');
        fs.writeFileSync(path.join(dir, 'b.js'), '');     // ignored
        fs.writeFileSync(path.join(dir, 'README.md'), ''); // ignored
        fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'sub', 'c.ts'), '');
        fs.writeFileSync(path.join(dir, 'sub', 'c.ts.meta'), '');

        const files = installer.listRuntimeFiles(dir);
        expect(files).toEqual(['a.ts', 'a.ts.meta', path.join('sub', 'c.ts'), path.join('sub', 'c.ts.meta')]);
    });

    test('getDefaultSourceDir returns assets/script/controller', () => {
        const projectDir = '/some/project';
        expect(installer.getDefaultSourceDir(projectDir)).toBe(path.join(projectDir, 'assets', 'script', 'controller'));
    });

    test('installRuntime returns noop when source equals target', () => {
        const dir = path.join(scratch, 'src');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'a.ts'), 'export {};');
        const result = installer.installRuntime({ sourceDir: dir, targetDir: dir });
        expect(result.action).toBe('noop');
        expect(result.filesAffected).toEqual([]);
    });

    test('installRuntime copies files into a different target and creates a backup', () => {
        const src = path.join(scratch, 'src');
        const tgt = path.join(scratch, 'tgt');
        fs.mkdirSync(src, { recursive: true });
        fs.mkdirSync(tgt, { recursive: true });
        fs.writeFileSync(path.join(src, 'a.ts'), 'export const v = 2;');
        fs.writeFileSync(path.join(src, 'a.ts.meta'), '{"ver":"new"}');
        // pre-existing target file with stale content
        fs.writeFileSync(path.join(tgt, 'a.ts'), 'export const v = 1;');
        fs.writeFileSync(path.join(tgt, 'a.ts.meta'), '{"ver":"old"}');

        const result = installer.installRuntime({
            sourceDir: src,
            targetDir: tgt,
            backupRoot: scratch,
        });

        expect(result.action).toBe('updated');
        expect(result.filesAffected.length).toBeGreaterThan(0);
        expect(result.backupPath).toBeTruthy();
        expect(fs.existsSync(result.backupPath)).toBe(true);
        // Backup contains the OLD content
        expect(fs.readFileSync(path.join(result.backupPath, 'a.ts'), 'utf8')).toBe('export const v = 1;');
        // Target now has the NEW content
        expect(fs.readFileSync(path.join(tgt, 'a.ts'), 'utf8')).toBe('export const v = 2;');
    });

    test('installRuntime returns noop when target already matches source byte-for-byte', () => {
        const src = path.join(scratch, 'src');
        const tgt = path.join(scratch, 'tgt');
        fs.mkdirSync(src, { recursive: true });
        fs.mkdirSync(tgt, { recursive: true });
        const content = 'export const v = 1;';
        fs.writeFileSync(path.join(src, 'a.ts'), content);
        fs.writeFileSync(path.join(tgt, 'a.ts'), content);
        const result = installer.installRuntime({ sourceDir: src, targetDir: tgt });
        expect(result.action).toBe('noop');
    });

    test('installRuntime fails gracefully when sourceDir does not exist', () => {
        const tgt = path.join(scratch, 'tgt');
        fs.mkdirSync(tgt, { recursive: true });
        const result = installer.installRuntime({ sourceDir: path.join(scratch, 'nope'), targetDir: tgt });
        expect(result.action).toBe('failed');
        expect(result.error).toMatch(/sourceDir not found/);
    });

    test('installRuntime rolls back partial writes when copyFile fails (M5)', () => {
        const src = path.join(scratch, 'src');
        const tgt = path.join(scratch, 'tgt');
        fs.mkdirSync(src, { recursive: true });
        fs.mkdirSync(tgt, { recursive: true });
        // 3 source files; pre-existing target counterparts
        fs.writeFileSync(path.join(src, 'a.ts'), 'NEW-A');
        fs.writeFileSync(path.join(src, 'b.ts'), 'NEW-B');
        fs.writeFileSync(path.join(src, 'c.ts'), 'NEW-C');
        fs.writeFileSync(path.join(tgt, 'a.ts'), 'OLD-A');
        fs.writeFileSync(path.join(tgt, 'b.ts'), 'OLD-B');
        fs.writeFileSync(path.join(tgt, 'c.ts'), 'OLD-C');

        // Monkey-patch fs.copyFileSync to fail on the 2nd call
        const realCopy = fs.copyFileSync;
        let callCount = 0;
        fs.copyFileSync = function (s, t) {
            callCount++;
            // 1st call = backup of a.ts; let backups pass.
            // We want the failure on the WRITE of b.ts. Detect by target dir.
            if (callCount > 3 && callCount === 5) { // backups (3) + write a.ts (1) + write b.ts → fail
                throw new Error('simulated EIO');
            }
            return realCopy(s, t);
        };

        let result;
        try {
            result = installer.installRuntime({
                sourceDir: src,
                targetDir: tgt,
                backupRoot: scratch,
            });
        }
        finally {
            fs.copyFileSync = realCopy;
        }

        expect(result.action).toBe('failed');
        expect(result.rolledBack).toBe(true);
        expect(result.error).toMatch(/simulated EIO/);
        // After rollback, target files should be back to OLD-* content
        expect(fs.readFileSync(path.join(tgt, 'a.ts'), 'utf8')).toBe('OLD-A');
        expect(fs.readFileSync(path.join(tgt, 'b.ts'), 'utf8')).toBe('OLD-B');
    });

    test('getRuntimeStatus reports missing and modified', () => {
        const src = path.join(scratch, 'src');
        const tgt = path.join(scratch, 'tgt');
        fs.mkdirSync(src, { recursive: true });
        fs.mkdirSync(tgt, { recursive: true });
        fs.writeFileSync(path.join(src, 'a.ts'), 'V2');
        fs.writeFileSync(path.join(src, 'b.ts'), 'NEW');
        fs.writeFileSync(path.join(tgt, 'a.ts'), 'V1'); // modified
        // b.ts missing in tgt
        const status = installer.getRuntimeStatus(src, tgt);
        expect(status.modified).toContain('a.ts');
        expect(status.missing).toContain('b.ts');
    });
});
