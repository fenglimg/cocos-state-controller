/**
 * Version Manager
 * Handles version comparison and management for ccc-state-controller
 */

const fs = require('fs');
const path = require('path');

/**
 * Compare two semantic version strings
 * @param {string} v1 - First version (e.g., "1.0.0")
 * @param {string} v2 - Second version (e.g., "1.2.0")
 * @returns {number} - 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
    if (!v1 || !v2) {
        return v1 ? 1 : (v2 ? -1 : 0);
    }

    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;

        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }

    return 0;
}

/**
 * Read version from package.json
 * @param {string} packagePath - Path to package.json
 * @returns {string|null} - Version string or null
 */
function readPackageVersion(packagePath) {
    try {
        if (!fs.existsSync(packagePath)) {
            return null;
        }

        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        return packageJson.version || null;
    } catch (error) {
        console.error(`Failed to read package version from ${packagePath}:`, error.message);
        return null;
    }
}

/**
 * Read version from version file
 * @param {string} versionFile - Path to .ccc-state-controller-version file
 * @returns {string|null} - Version string or null
 */
function readVersionFile(versionFile) {
    try {
        if (!fs.existsSync(versionFile)) {
            return null;
        }

        const content = fs.readFileSync(versionFile, 'utf-8').trim();
        return content || null;
    } catch (error) {
        console.error(`Failed to read version file ${versionFile}:`, error.message);
        return null;
    }
}

/**
 * Write version to version file
 * @param {string} versionFile - Path to .ccc-state-controller-version file
 * @param {string} version - Version string to write
 * @returns {boolean} - Success status
 */
function writeVersionFile(versionFile, version) {
    try {
        const dir = path.dirname(versionFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(versionFile, version, 'utf-8');
        return true;
    } catch (error) {
        console.error(`Failed to write version file ${versionFile}:`, error.message);
        return false;
    }
}

/**
 * Check if update is available
 * @param {string} currentVersion - Currently installed version
 * @param {string} latestVersion - Latest available version
 * @returns {object} - { needsUpdate: boolean, isDowngrade: boolean, comparison: number }
 */
function checkForUpdate(currentVersion, latestVersion) {
    const comparison = compareVersions(latestVersion, currentVersion);

    return {
        needsUpdate: comparison > 0,
        isDowngrade: comparison < 0,
        comparison: comparison,
        currentVersion: currentVersion,
        latestVersion: latestVersion
    };
}

/**
 * Get installed version in target directory
 * @param {string} targetDir - Target installation directory
 * @returns {string|null} - Installed version or null
 */
function getInstalledVersion(targetDir) {
    const versionFile = path.join(targetDir, '.ccc-state-controller-version');
    return readVersionFile(versionFile);
}

/**
 * Set installed version in target directory
 * @param {string} targetDir - Target installation directory
 * @param {string} version - Version to set
 * @returns {boolean} - Success status
 */
function setInstalledVersion(targetDir, version) {
    const versionFile = path.join(targetDir, '.ccc-state-controller-version');
    return writeVersionFile(versionFile, version);
}

/**
 * Get core package version
 * @param {string} corePackagePath - Path to core package directory
 * @returns {string|null} - Core package version or null
 */
function getCorePackageVersion(corePackagePath) {
    const packageJsonPath = path.join(corePackagePath, 'package.json');
    return readPackageVersion(packageJsonPath);
}

module.exports = {
    compareVersions,
    readPackageVersion,
    readVersionFile,
    writeVersionFile,
    checkForUpdate,
    getInstalledVersion,
    setInstalledVersion,
    getCorePackageVersion
};
