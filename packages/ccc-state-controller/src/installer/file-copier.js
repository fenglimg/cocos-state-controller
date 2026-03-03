/**
 * File Copier
 * Handles file copying with backup and overwrite support
 */

const fs = require('fs');
const path = require('path');

/**
 * Copy single file
 * @param {string} src - Source file path
 * @param {string} dest - Destination file path
 * @param {object} options - Copy options
 * @param {boolean} options.overwrite - Overwrite existing files (default: true)
 * @param {boolean} options.backup - Create backup before overwriting (default: true)
 * @returns {object} - { success: boolean, backupPath?: string, error?: string }
 */
function copyFile(src, dest, options = {}) {
    const { overwrite = true, backup = true } = options;

    try {
        // Check if source exists
        if (!fs.existsSync(src)) {
            return {
                success: false,
                error: `Source file not found: ${src}`
            };
        }

        // Check if destination exists
        if (fs.existsSync(dest)) {
            if (!overwrite) {
                return {
                    success: false,
                    error: `Destination file exists: ${dest}`
                };
            }

            // Create backup if requested
            if (backup) {
                const backupPath = `${dest}.backup.${Date.now()}`;
                fs.copyFileSync(dest, backupPath);

                return {
                    success: true,
                    backupPath: backupPath
                };
            }
        }

        // Ensure destination directory exists
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Copy file
        fs.copyFileSync(src, dest);

        return {
            success: true,
            backupPath: null
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Copy directory recursively
 * @param {string} srcDir - Source directory
 * @param {string} destDir - Destination directory
 * @param {object} options - Copy options
 * @param {boolean} options.overwrite - Overwrite existing files (default: true)
 * @param {boolean} options.backup - Create backups (default: true)
 * @param {string[]} options.exclude - Patterns to exclude
 * @param {function} options.filter - Filter function (return true to include)
 * @returns {object} - { success: boolean, files: string[], backups: string[], errors: string[] }
 */
function copyDirectory(srcDir, destDir, options = {}) {
    const { overwrite = true, backup = true, exclude = [], filter = null } = options;

    const result = {
        success: true,
        files: [],
        backups: [],
        errors: []
    };

    try {
        // Check if source exists
        if (!fs.existsSync(srcDir)) {
            result.success = false;
            result.errors.push(`Source directory not found: ${srcDir}`);
            return result;
        }

        // Create destination directory
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Read source directory
        const entries = fs.readdirSync(srcDir, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(srcDir, entry.name);
            const destPath = path.join(destDir, entry.name);

            // Check exclusion patterns
            if (exclude.some(pattern => entry.name.includes(pattern))) {
                continue;
            }

            // Apply filter if provided
            if (filter && !filter(srcPath, entry.isDirectory())) {
                continue;
            }

            if (entry.isDirectory()) {
                // Recursively copy subdirectory
                const subResult = copyDirectory(srcPath, destPath, options);
                result.files.push(...subResult.files);
                result.backups.push(...subResult.backups);
                result.errors.push(...subResult.errors);

                if (!subResult.success) {
                    result.success = false;
                }
            } else {
                // Copy file
                const copyResult = copyFile(srcPath, destPath, { overwrite, backup });

                if (copyResult.success) {
                    result.files.push(destPath);
                    if (copyResult.backupPath) {
                        result.backups.push(copyResult.backupPath);
                    }
                } else {
                    result.errors.push(copyResult.error);
                    result.success = false;
                }
            }
        }
    } catch (error) {
        result.success = false;
        result.errors.push(error.message);
    }

    return result;
}

/**
 * Restore from backup
 * @param {string} backupPath - Backup file path
 * @param {string} originalPath - Original file path
 * @returns {object} - { success: boolean, error?: string }
 */
function restoreBackup(backupPath, originalPath) {
    try {
        if (!fs.existsSync(backupPath)) {
            return {
                success: false,
                error: `Backup file not found: ${backupPath}`
            };
        }

        fs.copyFileSync(backupPath, originalPath);
        fs.unlinkSync(backupPath);

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Clean up backup files
 * @param {string[]} backupPaths - Array of backup file paths
 * @returns {object} - { success: boolean, cleaned: number, errors: string[] }
 */
function cleanBackups(backupPaths) {
    const result = {
        success: true,
        cleaned: 0,
        errors: []
    };

    for (const backupPath of backupPaths) {
        try {
            if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath);
                result.cleaned++;
            }
        } catch (error) {
            result.errors.push(`Failed to delete ${backupPath}: ${error.message}`);
            result.success = false;
        }
    }

    return result;
}

/**
 * Copy core package files to target directory
 * @param {string} corePackagePath - Path to core package
 * @param {string} targetDir - Target installation directory
 * @param {object} options - Installation options
 * @returns {object} - Copy result with files, backups, and errors
 */
function installCorePackage(corePackagePath, targetDir, options = {}) {
    const srcDir = path.join(corePackagePath, 'src');

    // Default exclusions
    const defaultExclude = ['node_modules', '.DS_Store', '.git'];
    const exclude = [...defaultExclude, ...(options.exclude || [])];

    // Default filter: include .ts files and .meta files for Cocos Creator
    const defaultFilter = (filePath, isDir) => {
        if (isDir) return true;
        const ext = path.extname(filePath);
        return ext === '.ts' || ext === '.meta';
    };
    const filter = options.filter || defaultFilter;

    return copyDirectory(srcDir, targetDir, {
        overwrite: options.overwrite !== false,
        backup: options.backup !== false,
        exclude,
        filter
    });
}

module.exports = {
    copyFile,
    copyDirectory,
    restoreBackup,
    cleanBackups,
    installCorePackage
};
