'use strict';

/**
 * Runtime installer: copies StateController source files (.ts + .meta) from
 * a source directory into a target project directory.
 *
 * Public API:
 *   - listRuntimeFiles(dir): string[]                 -> .ts/.meta files only
 *   - getDefaultSourceDir(projectDir): string         -> '<projectDir>/assets/script/controller'
 *   - getRuntimeStatus(sourceDir, targetDir): object  -> { source, target, missing[], modified[] }
 *   - installRuntime({sourceDir, targetDir, overwrite}): { action, filesAffected, backupPath, rolledBack? }
 *
 * Behaviour:
 *   - When sourceDir == targetDir → action='noop'
 *   - Diff via SHA-256 hash; identical files are skipped
 *   - Backup target before write into temp/state-controller-backup-{timestamp}/
 *   - M5 will add full rollback() on partial-write failure (this M4 stub records the backup path)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const RUNTIME_EXTS = new Set(['.ts', '.meta']);

function listRuntimeFiles(dir) {
    if (!dir || !fs.existsSync(dir)) return [];
    const out = [];
    walk(dir, dir, out);
    return out.sort();
}

function walk(rootDir, currentDir, out) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            walk(rootDir, full, out);
        }
        else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (RUNTIME_EXTS.has(ext)) {
                out.push(path.relative(rootDir, full));
            }
        }
    }
}

function getDefaultSourceDir(projectDir) {
    return path.join(projectDir, 'assets', 'script', 'controller');
}

function sha256OfFile(filePath) {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function getRuntimeStatus(sourceDir, targetDir) {
    const result = { source: sourceDir, target: targetDir, missing: [], modified: [] };
    if (!sourceDir || !fs.existsSync(sourceDir)) return result;
    const files = listRuntimeFiles(sourceDir);
    for (const rel of files) {
        const srcPath = path.join(sourceDir, rel);
        const tgtPath = path.join(targetDir, rel);
        if (!fs.existsSync(tgtPath)) {
            result.missing.push(rel);
            continue;
        }
        try {
            if (sha256OfFile(srcPath) !== sha256OfFile(tgtPath)) result.modified.push(rel);
        }
        catch (_) {
            result.modified.push(rel);
        }
    }
    return result;
}

function ensureDirSync(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function backupTarget(targetDir, files, backupRoot) {
    const backupPath = path.join(backupRoot, `state-controller-backup-${timestamp()}`);
    ensureDirSync(backupPath);
    for (const rel of files) {
        const srcPath = path.join(targetDir, rel);
        if (!fs.existsSync(srcPath)) continue;
        const dstPath = path.join(backupPath, rel);
        ensureDirSync(path.dirname(dstPath));
        fs.copyFileSync(srcPath, dstPath);
    }
    return backupPath;
}

/**
 * Install runtime files from source -> target.
 *
 * @param {object} opts
 * @param {string} opts.sourceDir
 * @param {string} opts.targetDir
 * @param {boolean} [opts.overwrite=true]
 * @param {string} [opts.backupRoot=os.tmpdir()]
 * @returns {{action: string, filesAffected: string[], backupPath: string|null, rolledBack?: boolean, error?: string}}
 */
function installRuntime(opts) {
    const sourceDir = opts && opts.sourceDir;
    const targetDir = opts && opts.targetDir;
    const overwrite = (opts && opts.overwrite !== undefined) ? !!opts.overwrite : true;
    const backupRoot = (opts && opts.backupRoot) || os.tmpdir();

    if (!sourceDir || !targetDir) {
        return { action: 'failed', filesAffected: [], backupPath: null, error: 'sourceDir and targetDir are required' };
    }
    if (path.resolve(sourceDir) === path.resolve(targetDir)) {
        return { action: 'noop', filesAffected: [], backupPath: null };
    }
    if (!fs.existsSync(sourceDir)) {
        return { action: 'failed', filesAffected: [], backupPath: null, error: `sourceDir not found: ${sourceDir}` };
    }

    const files = listRuntimeFiles(sourceDir);
    const status = getRuntimeStatus(sourceDir, targetDir);
    const candidates = [...status.missing, ...status.modified];

    if (candidates.length === 0 && files.length > 0) {
        return { action: 'noop', filesAffected: [], backupPath: null };
    }

    // Backup any pre-existing target file we are about to overwrite
    const toBackup = candidates.filter((rel) => fs.existsSync(path.join(targetDir, rel)));
    let backupPath = null;
    if (toBackup.length > 0 && overwrite) {
        backupPath = backupTarget(targetDir, toBackup, backupRoot);
    }

    // M5: try/catch each copyFile + roll back on first failure
    const written = [];
    for (const rel of candidates) {
        const srcPath = path.join(sourceDir, rel);
        const tgtPath = path.join(targetDir, rel);
        const exists = fs.existsSync(tgtPath);
        if (exists && !overwrite) continue;
        try {
            ensureDirSync(path.dirname(tgtPath));
            fs.copyFileSync(srcPath, tgtPath);
            written.push(rel);
        }
        catch (err) {
            // Partial failure → restore from backup, abort install
            const rolledBack = backupPath ? rollback(backupPath, targetDir, written) : false;
            return {
                action: 'failed',
                filesAffected: written.slice(),
                backupPath,
                rolledBack,
                partiallyWrittenFiles: written.slice(),
                error: err && err.message ? err.message : String(err),
            };
        }
    }

    if (written.length === 0) {
        return { action: 'noop', filesAffected: [], backupPath: backupPath };
    }
    return {
        action: status.missing.length > 0 && status.modified.length === 0 ? 'install' : 'updated',
        filesAffected: written,
        backupPath,
    };
}

/**
 * Restore files from a backup directory, replacing whatever currently sits at the
 * matching path under `targetDir`. Returns true on a clean restore, false on any
 * filesystem error (best-effort — never throws).
 */
function rollback(backupPath, targetDir, partialFiles) {
    if (!backupPath || !fs.existsSync(backupPath)) return false;
    try {
        const files = listRuntimeFiles(backupPath);
        for (const rel of files) {
            const src = path.join(backupPath, rel);
            const tgt = path.join(targetDir, rel);
            ensureDirSync(path.dirname(tgt));
            fs.copyFileSync(src, tgt);
        }
        // Remove any partially-written files that did NOT exist before backup
        // (i.e. they show up in partialFiles but not in the backup directory)
        if (Array.isArray(partialFiles)) {
            for (const rel of partialFiles) {
                const backupVersion = path.join(backupPath, rel);
                if (!fs.existsSync(backupVersion)) {
                    const tgtPath = path.join(targetDir, rel);
                    if (fs.existsSync(tgtPath)) {
                        try { fs.unlinkSync(tgtPath); } catch (_) { /* best-effort */ }
                    }
                }
            }
        }
        return true;
    }
    catch (_) {
        return false;
    }
}

module.exports = {
    RUNTIME_EXTS,
    listRuntimeFiles,
    getDefaultSourceDir,
    getRuntimeStatus,
    installRuntime,
    rollback,
};
