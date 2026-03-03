/**
 * ccc-state-controller Extension Main Entry
 * Handles IPC communication between panel and installer
 */

const path = require('path');
const fs = require('fs');
const installer = require('./src/installer');

// Core package path (relative to this extension)
const CORE_PACKAGE_PATH = path.join(__dirname, '../ccc-state-controller-core');

/**
 * Get the default target path (current project's assets/Controller)
 * @returns {string} Default installation path
 */
function getDefaultTargetPath() {
  const projectPath = Editor.Project.path || Editor.projectInfo.path;
  if (projectPath) {
    return path.join(projectPath, 'assets/Controller');
  }
  return '';
}

/**
 * Get core package version
 * @returns {string} Core package version
 */
function getCorePackageVersion() {
  try {
    const packageJsonPath = path.join(CORE_PACKAGE_PATH, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return packageJson.version || '1.0.0';
    }

    // Fallback to version manager
    return installer.versionManager
      ? installer.versionManager.getCorePackageVersion(CORE_PACKAGE_PATH)
      : '1.0.0';
  } catch (error) {
    return '1.0.0';
  }
}

// Extension initialization
module.exports = {
  /**
   * Extension loaded
   */
  load() {
    Editor.log('[ccc-state-controller] Extension loaded');
  },

  /**
   * Extension unloaded
   */
  unload() {
    Editor.log('[ccc-state-controller] Extension unloaded');
  },

  // IPC Message handlers
  messages: {
    /**
     * Open the installer panel
     */
    'ccc-state-controller:open'() {
      Editor.log('[ccc-state-controller] Opening panel');
      Editor.Panel.open('ccc-state-controller');
    },

    /**
     * Quick install from menu
     */
    'ccc-state-controller:install'() {
      const targetPath = getDefaultTargetPath();
      if (!targetPath) {
        Editor.warn('[ccc-state-controller] No project open');
        return;
      }

      Editor.log('[ccc-state-controller] Installing to: ' + targetPath);

      const result = installer.install(CORE_PACKAGE_PATH, targetPath);

      if (result.success) {
        Editor.success(`[ccc-state-controller] Installed version ${result.toVersion} successfully!`);
        // Refresh assets
        Editor.Ipc.sendToAll('assets:refresh');
      } else {
        Editor.error('[ccc-state-controller] Installation failed: ' + result.errors.join(', '));
      }
    },

    /**
     * Quick update from menu
     */
    'ccc-state-controller:update'() {
      const targetPath = getDefaultTargetPath();
      if (!targetPath) {
        Editor.warn('[ccc-state-controller] No project open');
        return;
      }

      Editor.log('[ccc-state-controller] Updating: ' + targetPath);

      const result = installer.update(CORE_PACKAGE_PATH, targetPath);

      if (result.success) {
        if (result.action === 'none') {
          Editor.info('[ccc-state-controller] Already up-to-date');
        } else {
          Editor.success(`[ccc-state-controller] Updated to version ${result.toVersion}!`);
          // Refresh assets
          Editor.Ipc.sendToAll('assets:refresh');
        }
      } else {
        Editor.error('[ccc-state-controller] Update failed: ' + result.errors.join(', '));
      }
    },

    /**
     * Check for updates from menu
     */
    'ccc-state-controller:check-update'() {
      const targetPath = getDefaultTargetPath();
      if (!targetPath) {
        Editor.warn('[ccc-state-controller] No project open');
        return;
      }

      const result = installer.checkUpdate(CORE_PACKAGE_PATH, targetPath);

      if (result.needsInstall) {
        Editor.info('[ccc-state-controller] State Controller is not installed');
      } else if (result.updateAvailable) {
        Editor.info(`[ccc-state-controller] Update available: ${result.currentVersion} -> ${result.latestVersion}`);
      } else if (result.error) {
        Editor.error('[ccc-state-controller] Error: ' + result.error);
      } else {
        Editor.success('[ccc-state-controller] Up-to-date (version ' + result.currentVersion + ')');
      }
    },

    /**
     * Initialize panel with default data
     * @param {object} event - IPC event
     */
    'ccc-state-controller:init-panel'(event) {
      const targetPath = getDefaultTargetPath();
      const coreVersion = getCorePackageVersion();

      event.reply(null, {
        corePath: CORE_PACKAGE_PATH,
        targetPath: targetPath,
        coreVersion: coreVersion
      });
    },

    /**
     * Select directory dialog
     * @param {object} event - IPC event
     */
    'ccc-state-controller:select-directory'(event) {
      // Cocos Creator 2.x uses Editor.Dialog
      const result = Editor.Dialog.showOpenDialog({
        title: 'Select Installation Directory',
        defaultPath: Editor.Project.path || Editor.projectInfo.path,
        properties: ['openDirectory', 'createDirectory']
      });

      if (result && result.length > 0) {
        event.reply(null, { path: result[0] });
      } else {
        event.reply(null, null);
      }
    },

    /**
     * Get installation status
     * @param {object} event - IPC event
     * @param {string} targetPath - Target directory
     */
    'ccc-state-controller:get-status'(event, targetPath) {
      if (!targetPath) {
        event.reply(null, { installed: false });
        return;
      }

      const result = installer.getStatus(targetPath);
      event.reply(null, result);
    },

    /**
     * Install to target directory
     * @param {object} event - IPC event
     * @param {string} targetPath - Target directory
     */
    'ccc-state-controller:install'(event, targetPath) {
      if (!targetPath) {
        event.reply(new Error('No target path specified'));
        return;
      }

      // Send progress update
      const sendProgress = (percent, message) => {
        Editor.Ipc.sendToPanel('ccc-state-controller', 'ccc-state-controller:progress', {
          percent,
          message
        });
      };

      sendProgress(10, 'Starting installation...');

      // Validate core package exists
      if (!fs.existsSync(CORE_PACKAGE_PATH)) {
        event.reply(new Error('Core package not found: ' + CORE_PACKAGE_PATH));
        return;
      }

      sendProgress(30, 'Copying files...');

      const result = installer.install(CORE_PACKAGE_PATH, targetPath, {
        force: false,
        backup: true,
        validate: true
      });

      sendProgress(90, 'Validating installation...');

      // Refresh assets if successful
      if (result.success) {
        sendProgress(100, 'Complete!');
        Editor.Ipc.sendToAll('assets:refresh');
        Editor.success(`[ccc-state-controller] Installed version ${result.toVersion}`);
      }

      event.reply(null, result);
    },

    /**
     * Update existing installation
     * @param {object} event - IPC event
     * @param {string} targetPath - Target directory
     */
    'ccc-state-controller:update'(event, targetPath) {
      if (!targetPath) {
        event.reply(new Error('No target path specified'));
        return;
      }

      const sendProgress = (percent, message) => {
        Editor.Ipc.sendToPanel('ccc-state-controller', 'ccc-state-controller:progress', {
          percent,
          message
        });
      };

      sendProgress(10, 'Starting update...');

      const result = installer.update(CORE_PACKAGE_PATH, targetPath, {
        backup: true,
        validate: true
      });

      sendProgress(90, 'Validating...');

      if (result.success && result.action !== 'none') {
        sendProgress(100, 'Complete!');
        Editor.Ipc.sendToAll('assets:refresh');
        Editor.success(`[ccc-state-controller] Updated to version ${result.toVersion}`);
      }

      event.reply(null, result);
    },

    /**
     * Force reinstall
     * @param {object} event - IPC event
     * @param {string} targetPath - Target directory
     */
    'ccc-state-controller:reinstall'(event, targetPath) {
      if (!targetPath) {
        event.reply(new Error('No target path specified'));
        return;
      }

      const sendProgress = (percent, message) => {
        Editor.Ipc.sendToPanel('ccc-state-controller', 'ccc-state-controller:progress', {
          percent,
          message
        });
      };

      sendProgress(10, 'Starting reinstall...');

      const result = installer.install(CORE_PACKAGE_PATH, targetPath, {
        force: true,
        backup: true,
        validate: true
      });

      sendProgress(90, 'Validating...');

      if (result.success) {
        sendProgress(100, 'Complete!');
        Editor.Ipc.sendToAll('assets:refresh');
        Editor.success(`[ccc-state-controller] Reinstalled version ${result.toVersion}`);
      }

      event.reply(null, result);
    },

    /**
     * Uninstall from target directory
     * @param {object} event - IPC event
     * @param {string} targetPath - Target directory
     */
    'ccc-state-controller:uninstall'(event, targetPath) {
      if (!targetPath) {
        event.reply(new Error('No target path specified'));
        return;
      }

      const sendProgress = (percent, message) => {
        Editor.Ipc.sendToPanel('ccc-state-controller', 'ccc-state-controller:progress', {
          percent,
          message
        });
      };

      sendProgress(10, 'Starting uninstall...');

      const result = installer.uninstall(targetPath);

      sendProgress(100, 'Complete!');

      if (result.success) {
        Editor.Ipc.sendToAll('assets:refresh');
        Editor.success('[ccc-state-controller] Uninstalled successfully');
      }

      event.reply(null, result);
    }
  }
};
