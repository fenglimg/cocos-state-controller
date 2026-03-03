/**
 * Installer Main Entry
 * Coordinates version management, file copying, and validation
 */

const path = require('path');
const versionManager = require('./version-manager');
const fileCopier = require('./file-copier');
const validator = require('./validator');

/**
 * Installation result object
 * @typedef {object} InstallResult
 * @property {boolean} success - Installation success status
 * @property {string} action - Action performed (install/update/reinstall)
 * @property {string} fromVersion - Previous version (if update)
 * @property {string} toVersion - Installed version
 * @property {string[]} files - Installed files
 * @property {string[]} backups - Created backups
 * @property {string[]} errors - Error messages
 */

/**
 * Install core package to target directory
 * @param {string} corePackagePath - Path to core package
 * @param {string} targetDir - Target installation directory
 * @param {object} options - Installation options
 * @param {boolean} options.force - Force reinstall even if same version
 * @param {boolean} options.backup - Create backups (default: true)
 * @param {boolean} options.validate - Validate after installation (default: true)
 * @returns {InstallResult} - Installation result
 */
function install(corePackagePath, targetDir, options = {}) {
    const { force = false, backup = true, validate = true } = options;

    const result = {
        success: true,
        action: 'install',
        fromVersion: null,
        toVersion: null,
        files: [],
        backups: [],
        errors: []
    };

    try {
        // Get core package version
        const coreVersion = versionManager.getCorePackageVersion(corePackagePath);

        if (!coreVersion) {
            result.success = false;
            result.errors.push('Failed to read core package version');
            return result;
        }

        result.toVersion = coreVersion;

        // Get installed version
        const installedVersion = versionManager.getInstalledVersion(targetDir);

        if (installedVersion) {
            result.fromVersion = installedVersion;

            // Check if update is needed
            const updateCheck = versionManager.checkForUpdate(installedVersion, coreVersion);

            if (!force && updateCheck.comparison === 0) {
                result.action = 'none';
                result.success = true;
                result.errors.push('Already up-to-date');
                return result;
            } else if (updateCheck.comparison > 0) {
                result.action = 'update';
            } else if (updateCheck.comparison < 0) {
                result.action = 'downgrade';
                result.errors.push(`Warning: Downgrading from ${installedVersion} to ${coreVersion}`);
            }
        }

        // Install files
        const copyResult = fileCopier.installCorePackage(corePackagePath, targetDir, {
            overwrite: true,
            backup
        });

        result.files = copyResult.files;
        result.backups = copyResult.backups;

        if (!copyResult.success) {
            result.success = false;
            result.errors.push(...copyResult.errors);
            return result;
        }

        // Write version file
        const versionWritten = versionManager.setInstalledVersion(targetDir, coreVersion);

        if (!versionWritten) {
            result.success = false;
            result.errors.push('Failed to write version file');
            return result;
        }

        // Validate installation
        if (validate) {
            const validationResult = validator.validateFullInstallation(targetDir);

            if (!validationResult.valid) {
                result.success = false;
                result.errors.push(...validationResult.errors);
                return result;
            }
        }

        return result;
    } catch (error) {
        result.success = false;
        result.errors.push(`Installation error: ${error.message}`);
        return result;
    }
}

/**
 * Update existing installation
 * @param {string} corePackagePath - Path to core package
 * @param {string} targetDir - Target installation directory
 * @param {object} options - Update options
 * @returns {InstallResult} - Update result
 */
function update(corePackagePath, targetDir, options = {}) {
    return install(corePackagePath, targetDir, { ...options, force: false });
}

/**
 * Check if update is available
 * @param {string} corePackagePath - Path to core package
 * @param {string} targetDir - Target installation directory
 * @returns {object} - { updateAvailable: boolean, currentVersion?: string, latestVersion?: string }
 */
function checkUpdate(corePackagePath, targetDir) {
    try {
        const coreVersion = versionManager.getCorePackageVersion(corePackagePath);
        const installedVersion = versionManager.getInstalledVersion(targetDir);

        if (!coreVersion) {
            return {
                updateAvailable: false,
                error: 'Failed to read core package version'
            };
        }

        if (!installedVersion) {
            return {
                updateAvailable: true,
                latestVersion: coreVersion,
                needsInstall: true
            };
        }

        const updateCheck = versionManager.checkForUpdate(installedVersion, coreVersion);

        return {
            updateAvailable: updateCheck.needsUpdate,
            currentVersion: installedVersion,
            latestVersion: coreVersion,
            isDowngrade: updateCheck.isDowngrade
        };
    } catch (error) {
        return {
            updateAvailable: false,
            error: error.message
        };
    }
}

/**
 * Validate existing installation
 * @param {string} targetDir - Target installation directory
 * @returns {object} - Validation result
 */
function validate(targetDir) {
    return validator.validateFullInstallation(targetDir);
}

/**
 * Rollback installation from backups
 * @param {string} targetDir - Target installation directory
 * @param {string[]} backupPaths - Backup file paths to restore
 * @returns {object} - { success: boolean, restored: number, errors: string[] }
 */
function rollback(targetDir, backupPaths) {
    const result = {
        success: true,
        restored: 0,
        errors: []
    };

    for (const backupPath of backupPaths) {
        // Extract original path from backup path
        const originalPath = backupPath.replace(/\.backup\.\d+$/, '');
        const restoreResult = fileCopier.restoreBackup(backupPath, originalPath);

        if (restoreResult.success) {
            result.restored++;
        } else {
            result.errors.push(restoreResult.error);
            result.success = false;
        }
    }

    return result;
}

/**
 * Get installation status
 * @param {string} targetDir - Target installation directory
 * @returns {object} - { installed: boolean, version?: string, files?: string[] }
 */
function getStatus(targetDir) {
    try {
        const version = versionManager.getInstalledVersion(targetDir);

        if (!version) {
            return {
                installed: false
            };
        }

        const files = validator.getInstalledFiles(targetDir);
        const validation = validator.validateFullInstallation(targetDir);

        return {
            installed: true,
            version,
            files,
            valid: validation.valid,
            errors: validation.errors
        };
    } catch (error) {
        return {
            installed: false,
            error: error.message
        };
    }
}

/**
 * Uninstall from target directory
 * @param {string} targetDir - Target installation directory
 * @param {object} options - Uninstall options
 * @param {boolean} options.keepVersion - Keep version file (default: false)
 * @returns {object} - { success: boolean, removed: number, errors: string[] }
 */
function uninstall(targetDir, options = {}) {
    const { keepVersion = false } = options;
    const fs = require('fs');

    const result = {
        success: true,
        removed: 0,
        errors: []
    };

    try {
        const files = validator.getInstalledFiles(targetDir);

        for (const relativePath of files) {
            const filePath = path.join(targetDir, relativePath);

            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    result.removed++;
                }
            } catch (error) {
                result.errors.push(`Failed to remove ${relativePath}: ${error.message}`);
                result.success = false;
            }
        }

        // Remove version file
        if (!keepVersion) {
            const versionFile = path.join(targetDir, '.ccc-state-controller-version');
            if (fs.existsSync(versionFile)) {
                fs.unlinkSync(versionFile);
            }
        }

        return result;
    } catch (error) {
        result.success = false;
        result.errors.push(`Uninstall error: ${error.message}`);
        return result;
    }
}

module.exports = {
    install,
    update,
    checkUpdate,
    validate,
    rollback,
    getStatus,
    uninstall
};
