/**
 * Installer Module Tests
 * Tests for version management, file copying, and validation
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const versionManager = require('./version-manager');
const fileCopier = require('./file-copier');
const validator = require('./validator');
const installer = require('./index');

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        testsPassed++;
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        testsFailed++;
    }
}

// Test Version Manager
console.log('\n=== Version Manager Tests ===\n');

test('compareVersions - equal versions', () => {
    assert.strictEqual(versionManager.compareVersions('1.0.0', '1.0.0'), 0);
});

test('compareVersions - newer version', () => {
    assert.strictEqual(versionManager.compareVersions('1.2.0', '1.0.0'), 1);
});

test('compareVersions - older version', () => {
    assert.strictEqual(versionManager.compareVersions('1.0.0', '1.2.0'), -1);
});

test('compareVersions - major version difference', () => {
    assert.strictEqual(versionManager.compareVersions('2.0.0', '1.9.9'), 1);
});

test('compareVersions - patch version difference', () => {
    assert.strictEqual(versionManager.compareVersions('1.0.1', '1.0.0'), 1);
});

test('checkForUpdate - update available', () => {
    const result = versionManager.checkForUpdate('1.0.0', '1.1.0');
    assert.strictEqual(result.needsUpdate, true);
    assert.strictEqual(result.isDowngrade, false);
});

test('checkForUpdate - no update needed', () => {
    const result = versionManager.checkForUpdate('1.1.0', '1.1.0');
    assert.strictEqual(result.needsUpdate, false);
    assert.strictEqual(result.isDowngrade, false);
});

test('checkForUpdate - downgrade', () => {
    const result = versionManager.checkForUpdate('1.2.0', '1.1.0');
    assert.strictEqual(result.needsUpdate, false);
    assert.strictEqual(result.isDowngrade, true);
});

test('readPackageVersion - core package', () => {
    const corePath = path.join(__dirname, '../../../ccc-state-controller-core');
    const version = versionManager.getCorePackageVersion(corePath);
    assert.ok(version !== null, 'Should read version from core package');
    assert.strictEqual(version, '1.0.0');
});

// Test File Copier
console.log('\n=== File Copier Tests ===\n');

test('copyFile - basic copy', () => {
    const testDir = '/tmp/test-installer';
    const srcFile = path.join(testDir, 'test.txt');
    const destFile = path.join(testDir, 'test-copy.txt');
    
    // Setup
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(srcFile, 'test content');
    
    // Test
    const result = fileCopier.copyFile(srcFile, destFile, { backup: false });
    assert.strictEqual(result.success, true);
    assert.strictEqual(fs.existsSync(destFile), true);
    
    // Cleanup
    fs.unlinkSync(srcFile);
    fs.unlinkSync(destFile);
    fs.rmdirSync(testDir);
});

test('copyFile - with backup', () => {
    const testDir = '/tmp/test-installer-backup';
    const srcFile = path.join(testDir, 'test.txt');
    const destFile = path.join(testDir, 'test-dest.txt');
    
    // Setup
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(srcFile, 'new content');
    fs.writeFileSync(destFile, 'old content');
    
    // Test
    const result = fileCopier.copyFile(srcFile, destFile, { backup: true, overwrite: true });
    assert.strictEqual(result.success, true);
    assert.ok(result.backupPath, 'Should create backup');
    assert.strictEqual(fs.existsSync(result.backupPath), true);
    
    // Cleanup
    fs.unlinkSync(srcFile);
    fs.unlinkSync(destFile);
    fs.unlinkSync(result.backupPath);
    fs.rmdirSync(testDir);
});

// Test Validator
console.log('\n=== Validator Tests ===\n');

test('validateFile - existing file', () => {
    const result = validator.validateFile(__filename);
    assert.strictEqual(result.valid, true);
});

test('validateFile - non-existent file', () => {
    const result = validator.validateFile('/tmp/non-existent-file.txt');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('not found'));
});

test('validateInstallation - core package', () => {
    const coreSrcPath = path.join(__dirname, '../../../ccc-state-controller-core/src');
    const result = validator.validateInstallation(coreSrcPath);
    
    // Core package should have all required files
    assert.strictEqual(result.missing.length, 0, `Missing files: ${result.missing.join(', ')}`);
});

test('validateFullInstallation - core package', () => {
    const coreSrcPath = path.join(__dirname, '../../../ccc-state-controller-core/src');
    const result = validator.validateFullInstallation(coreSrcPath, { checkVersion: false });
    
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.installation.valid, true);
});

// Test Installer Main Entry
console.log('\n=== Installer Integration Tests ===\n');

test('checkUpdate - no installation', () => {
    const corePath = path.join(__dirname, '../../../ccc-state-controller-core');
    const targetDir = '/tmp/non-existent-target';
    
    const result = installer.checkUpdate(corePath, targetDir);
    assert.strictEqual(result.needsInstall, true);
    assert.strictEqual(result.latestVersion, '1.0.0');
});

test('checkUpdate - same version installed', () => {
    const corePath = path.join(__dirname, '../../../ccc-state-controller-core');
    const testDir = '/tmp/test-same-version';
    
    // Setup
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(path.join(testDir, '.ccc-state-controller-version'), '1.0.0');
    
    const result = installer.checkUpdate(corePath, testDir);
    assert.strictEqual(result.updateAvailable, false);
    assert.strictEqual(result.currentVersion, '1.0.0');
    
    // Cleanup
    fs.unlinkSync(path.join(testDir, '.ccc-state-controller-version'));
    fs.rmdirSync(testDir);
});

test('install - fresh installation', () => {
    const corePath = path.join(__dirname, '../../../ccc-state-controller-core');
    const testDir = '/tmp/test-install-fresh';
    
    // Clean test directory
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    
    const result = installer.install(corePath, testDir, { validate: true });
    
    assert.strictEqual(result.success, true, `Errors: ${result.errors.join(', ')}`);
    assert.strictEqual(result.action, 'install');
    assert.strictEqual(result.toVersion, '1.0.0');
    assert.ok(result.files.length > 0, 'Should install files');
    
    // Verify files exist
    assert.strictEqual(fs.existsSync(path.join(testDir, 'StateController.ts')), true);
    assert.strictEqual(fs.existsSync(path.join(testDir, '.ccc-state-controller-version')), true);
    
    // Cleanup
    fs.rmSync(testDir, { recursive: true });
});

test('getStatus - installed', () => {
    const corePath = path.join(__dirname, '../../../ccc-state-controller-core');
    const testDir = '/tmp/test-get-status';
    
    // Setup - install first
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
    }
    installer.install(corePath, testDir, { validate: false });
    
    const status = installer.getStatus(testDir);
    
    assert.strictEqual(status.installed, true);
    assert.strictEqual(status.version, '1.0.0');
    assert.ok(status.files.length > 0);
    
    // Cleanup
    fs.rmSync(testDir, { recursive: true });
});

// Test Summary
console.log('\n=== Test Summary ===\n');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
    process.exit(1);
}
