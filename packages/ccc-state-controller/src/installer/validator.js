/**
 * Validator
 * Validates installation integrity and completeness
 */

const fs = require('fs');
const path = require('path');

/**
 * Required core files for installation
 */
const REQUIRED_FILES = [
    'StateController.ts',
    'StateEnum.ts',
    'StateErrorManager.ts',
    'StatePropHandler.ts',
    'StateSelect.ts',
    'Props/StateComponentProps.ts',
    'Props/StateNodeProps.ts',
    'Props/StateToolsProps.ts',
    'Props/StateWidgetProps.ts'
];

/**
 * Validate a single file
 * @param {string} filePath - File path to validate
 * @returns {object} - { valid: boolean, error?: string }
 */
function validateFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return {
                valid: false,
                error: `File not found: ${filePath}`
            };
        }

        const stats = fs.statSync(filePath);

        if (!stats.isFile()) {
            return {
                valid: false,
                error: `Not a file: ${filePath}`
            };
        }

        // Check file is not empty
        if (stats.size === 0) {
            return {
                valid: false,
                error: `File is empty: ${filePath}`
            };
        }

        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            error: `Validation error: ${error.message}`
        };
    }
}

/**
 * Validate TypeScript file syntax (basic check)
 * @param {string} filePath - TypeScript file path
 * @returns {object} - { valid: boolean, error?: string }
 */
function validateTypeScriptFile(filePath) {
    const result = validateFile(filePath);

    if (!result.valid) {
        return result;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Basic TypeScript validation checks
        const checks = [
            {
                test: content.includes('export'),
                error: 'No exports found'
            },
            {
                test: !content.includes('syntax error'),
                error: 'Contains syntax error marker'
            }
        ];

        for (const check of checks) {
            if (!check.test) {
                return {
                    valid: false,
                    error: `${check.error} in ${filePath}`
                };
            }
        }

        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            error: `TypeScript validation error: ${error.message}`
        };
    }
}

/**
 * Validate installation directory structure
 * @param {string} targetDir - Target installation directory
 * @param {string[]} requiredFiles - Array of required file paths (relative)
 * @returns {object} - { valid: boolean, missing: string[], invalid: string[], errors: string[] }
 */
function validateInstallation(targetDir, requiredFiles = REQUIRED_FILES) {
    const result = {
        valid: true,
        missing: [],
        invalid: [],
        errors: []
    };

    try {
        // Check target directory exists
        if (!fs.existsSync(targetDir)) {
            result.valid = false;
            result.errors.push(`Target directory not found: ${targetDir}`);
            return result;
        }

        // Validate each required file
        for (const relativePath of requiredFiles) {
            const filePath = path.join(targetDir, relativePath);

            if (!fs.existsSync(filePath)) {
                result.missing.push(relativePath);
                result.valid = false;
            } else {
                // Validate TypeScript files
                if (relativePath.endsWith('.ts')) {
                    const validation = validateTypeScriptFile(filePath);

                    if (!validation.valid) {
                        result.invalid.push(relativePath);
                        result.errors.push(validation.error);
                        result.valid = false;
                    }
                }
            }
        }
    } catch (error) {
        result.valid = false;
        result.errors.push(`Validation error: ${error.message}`);
    }

    return result;
}

/**
 * Validate version file
 * @param {string} targetDir - Target installation directory
 * @returns {object} - { valid: boolean, version?: string, error?: string }
 */
function validateVersionFile(targetDir) {
    const versionFile = path.join(targetDir, '.ccc-state-controller-version');

    try {
        if (!fs.existsSync(versionFile)) {
            return {
                valid: false,
                error: 'Version file not found'
            };
        }

        const version = fs.readFileSync(versionFile, 'utf-8').trim();

        if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
            return {
                valid: false,
                error: `Invalid version format: ${version}`
            };
        }

        return {
            valid: true,
            version: version
        };
    } catch (error) {
        return {
            valid: false,
            error: `Version validation error: ${error.message}`
        };
    }
}

/**
 * Full installation validation
 * @param {string} targetDir - Target installation directory
 * @param {object} options - Validation options
 * @param {boolean} options.checkVersion - Check version file (default: true)
 * @param {string[]} options.requiredFiles - Custom required files list
 * @returns {object} - Comprehensive validation result
 */
function validateFullInstallation(targetDir, options = {}) {
    const { checkVersion = true, requiredFiles = REQUIRED_FILES } = options;

    const result = {
        valid: true,
        installation: null,
        version: null,
        errors: []
    };

    // Validate installation files
    result.installation = validateInstallation(targetDir, requiredFiles);

    if (!result.installation.valid) {
        result.valid = false;
        result.errors.push(...result.installation.errors);
    }

    // Validate version file
    if (checkVersion) {
        result.version = validateVersionFile(targetDir);

        if (!result.version.valid) {
            result.valid = false;
            result.errors.push(result.version.error);
        }
    }

    return result;
}

/**
 * Get list of installed files
 * @param {string} targetDir - Target installation directory
 * @returns {string[]} - Array of installed file paths (relative)
 */
function getInstalledFiles(targetDir) {
    const installedFiles = [];

    try {
        if (!fs.existsSync(targetDir)) {
            return installedFiles;
        }

        const entries = fs.readdirSync(targetDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const subDir = path.join(targetDir, entry.name);
                const subFiles = getInstalledFiles(subDir);
                installedFiles.push(...subFiles.map(f => path.join(entry.name, f)));
            } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.meta')) {
                installedFiles.push(entry.name);
            }
        }
    } catch (error) {
        console.error('Error getting installed files:', error.message);
    }

    return installedFiles;
}

/**
 * Check if installation is up-to-date
 * @param {string} targetDir - Target installation directory
 * @param {string} corePackageVersion - Core package version
 * @returns {object} - { isUpToDate: boolean, installedVersion?: string, error?: string }
 */
function checkInstallationStatus(targetDir, corePackageVersion) {
    try {
        const versionValidation = validateVersionFile(targetDir);

        if (!versionValidation.valid) {
            return {
                isUpToDate: false,
                error: versionValidation.error
            };
        }

        const installedVersion = versionValidation.version;
        const isUpToDate = installedVersion === corePackageVersion;

        return {
            isUpToDate,
            installedVersion
        };
    } catch (error) {
        return {
            isUpToDate: false,
            error: error.message
        };
    }
}

module.exports = {
    REQUIRED_FILES,
    validateFile,
    validateTypeScriptFile,
    validateInstallation,
    validateVersionFile,
    validateFullInstallation,
    getInstalledFiles,
    checkInstallationStatus
};
