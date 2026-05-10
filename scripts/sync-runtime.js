#!/usr/bin/env node
'use strict';

/**
 * Sync the StateController runtime sources from assets/script/controller/ into
 * packages/ccc-state-controller-workbench/runtime/ for publish packaging.
 *
 * - Copies *.ts and *.ts.meta only (matches lib/installer RUNTIME_EXTS)
 * - SHA-256 diff: identical files are skipped, modified files overwritten
 * - Files removed from source are deleted from target
 * - Outputs a {changed, added, removed} summary
 *
 * Usage: node scripts/sync-runtime.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'assets', 'script', 'controller');
const TARGET_DIR = path.join(PROJECT_ROOT, 'packages', 'ccc-state-controller-workbench', 'runtime');
const RUNTIME_EXTS = new Set(['.ts', '.meta']);

const dryRun = process.argv.includes('--dry-run');

function listRuntimeFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    walk(dir, dir, out);
    return out.sort();
}

function walk(rootDir, currentDir, out) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        const full = path.join(currentDir, entry.name);
        if (entry.isDirectory()) walk(rootDir, full, out);
        else if (entry.isFile() && RUNTIME_EXTS.has(path.extname(entry.name))) {
            out.push(path.relative(rootDir, full));
        }
    }
}

function hashFile(p) {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function ensureDir(d) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function main() {
    if (!fs.existsSync(SOURCE_DIR)) {
        console.error(`[sync-runtime] source not found: ${SOURCE_DIR}`);
        process.exit(1);
    }

    const sourceFiles = new Set(listRuntimeFiles(SOURCE_DIR));
    const targetFiles = new Set(listRuntimeFiles(TARGET_DIR));

    const changed = [];
    const added = [];
    const removed = [];

    for (const rel of sourceFiles) {
        const src = path.join(SOURCE_DIR, rel);
        const tgt = path.join(TARGET_DIR, rel);
        if (!fs.existsSync(tgt)) {
            added.push(rel);
            if (!dryRun) {
                ensureDir(path.dirname(tgt));
                fs.copyFileSync(src, tgt);
            }
        }
        else if (hashFile(src) !== hashFile(tgt)) {
            changed.push(rel);
            if (!dryRun) fs.copyFileSync(src, tgt);
        }
    }

    for (const rel of targetFiles) {
        if (!sourceFiles.has(rel)) {
            removed.push(rel);
            if (!dryRun) fs.unlinkSync(path.join(TARGET_DIR, rel));
        }
    }

    console.log(`[sync-runtime]${dryRun ? ' (dry-run)' : ''} added=${added.length} changed=${changed.length} removed=${removed.length}`);
    for (const f of added) console.log(`  + ${f}`);
    for (const f of changed) console.log(`  ~ ${f}`);
    for (const f of removed) console.log(`  - ${f}`);
}

main();
