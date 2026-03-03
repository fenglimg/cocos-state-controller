// panel/index.js - State Controller Installer Panel
// Compatible with Cocos Creator 2.x extension system

const path = require('path');
const fs = require('fs');

Editor.Panel.extend({
  // CSS styles - Cocos Creator dark theme compatible
  // Refactored with ui-ux-pro-max guidelines: 4.5:1 contrast, cursor-pointer, no emoji icons
  style: `
    :host {
      /* ===== CSS Variable System (ui-ux-pro-max) ===== */

      /* Color System - Slate Palette */
      --primary-color: #22C55E;
      --success-color: #50e3a4;
      --warning-color: #e8b83d;
      --error-color: #f45b6b;
      --info-color: #5cc4ff;

      /* Background Colors */
      --bg-primary: #0F172A;
      --bg-secondary: #1E293B;
      --bg-tertiary: #334155;
      --bg-elevated: #475569;

      /* Text Colors */
      --text-primary: #F8FAFC;
      --text-secondary: #94A3B8;
      --text-muted: #64748B;

      /* Border Colors */
      --border-default: #334155;
      --border-strong: #475569;
      --border-focus: #22C55E;

      /* Hover States */
      --primary-hover: #16A34A;
      --error-hover: #F87171;
      --bg-hover: #1E293B;

      /* Spacing Scale */
      --spacing-0: 0px;
      --spacing-1: 4px;
      --spacing-1-5: 6px;
      --spacing-2: 8px;
      --spacing-3: 12px;
      --spacing-4: 16px;

      /* Typography */
      --font-size-xs: 10px;
      --font-size-sm: 11px;
      --font-size-base: 12px;
      --font-size-md: 13px;
      --font-size-lg: 14px;
      --font-size-xl: 16px;
      --font-ui: 'Segoe UI', Arial, sans-serif;

      /* Transitions */
      --transition-fast: 100ms;
      --transition-normal: 150ms;
      --transition-slow: 250ms;
      --easing-default: cubic-bezier(0.4, 0, 0.2, 1);

      /* Border Radius */
      --radius-sm: 3px;
      --radius-md: 5px;
      --radius-lg: 8px;
      --radius-full: 9999px;

      /* ===== Base Styles ===== */
      margin: 0;
      padding: 12px;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
    }

    * {
      box-sizing: border-box;
    }

    .panel-header {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-default);
    }

    .panel-header h2 {
      margin: 0 0 4px 0;
      color: var(--primary-color);
      font-size: 16px;
      font-weight: 600;
    }

    .panel-header .version {
      color: var(--text-muted);
      font-size: 11px;
    }

    .section {
      margin-bottom: 16px;
    }

    .section-title {
      color: var(--text-secondary);
      font-size: 11px;
      text-transform: uppercase;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }

    .form-group {
      margin-bottom: 12px;
    }

    .form-group label {
      display: block;
      margin-bottom: 4px;
      color: var(--text-primary);
    }

    .path-input-group {
      display: flex;
      gap: var(--spacing-2);
      align-items: center;
    }

    .path-input-group ui-input {
      flex: 1;
    }

    ui-input {
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      color: var(--text-primary);
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      cursor: text;
      transition: border-color var(--transition-fast), background var(--transition-fast);
    }

    ui-input:focus {
      border-color: var(--primary-color);
      outline: none;
      box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
    }

    /* Button System Styles */
    ui-button {
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      color: var(--text-secondary);
      padding: var(--spacing-1-5) var(--spacing-3);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
    }

    ui-button:hover {
      background: var(--bg-hover);
      border-color: var(--border-strong);
    }

    ui-button:focus {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }

    ui-button.primary {
      background: var(--primary-color);
      border-color: transparent;
      color: #fff;
    }

    ui-button.primary:hover {
      background: #16A34A;
    }

    ui-button.primary:disabled {
      background: var(--bg-tertiary);
      border-color: var(--border-default);
      color: var(--text-muted);
      cursor: not-allowed;
    }

    ui-button.danger {
      background: var(--error-color);
      border-color: transparent;
      color: #fff;
    }

    ui-button.danger:hover {
      background: #F87171;
    }

    .button-group {
      display: flex;
      gap: var(--spacing-2);
      margin-top: var(--spacing-3);
    }

    .button-group ui-button {
      cursor: pointer;
    }

    /* Status card styles */
    .status-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: var(--spacing-3);
      margin-bottom: var(--spacing-3);
      border-left: 3px solid var(--text-muted);
      transition: border-color var(--transition-fast);
    }

    .status-card.installed {
      border-left-color: var(--success-color);
    }

    .status-card.not-installed {
      border-left-color: var(--text-muted);
    }

    .status-card.update-available {
      border-left-color: var(--warning-color);
    }

    .status-card.error {
      border-left-color: var(--error-color);
    }

    .status-title {
      font-weight: 600;
      margin-bottom: var(--spacing-2);
      display: flex;
      align-items: center;
      gap: var(--spacing-1-5);
      color: var(--text-primary);
    }

    .status-title .icon {
      font-size: var(--font-size-lg);
      font-family: monospace;
    }

    .status-detail {
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .version-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: var(--spacing-1);
    }

    .version-label {
      color: var(--text-muted);
    }

    .version-value {
      color: var(--text-primary);
      font-family: monospace;
    }

    /* Progress indicator */
    .progress-container {
      margin-top: var(--spacing-3);
      display: none;
    }

    .progress-container.visible {
      display: block;
    }

    .progress-bar {
      height: 4px;
      background: var(--border-default);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--primary-color);
      width: 0%;
      transition: width var(--transition-normal) ease;
    }

    .progress-text {
      margin-top: var(--spacing-1-5);
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
    }

    /* Log container */
    .log-container {
      background: var(--bg-primary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      padding: var(--spacing-2);
      margin-top: var(--spacing-3);
      max-height: 150px;
      overflow-y: auto;
      font-family: monospace;
      font-size: var(--font-size-sm);
      display: none;
    }

    .log-container.visible {
      display: block;
    }

    .log-entry {
      padding: var(--spacing-0-5) 0;
      color: var(--text-secondary);
    }

    .log-entry.info {
      color: var(--info-color);
    }

    .log-entry.success {
      color: var(--success-color);
    }

    .log-entry.error {
      color: var(--error-color);
    }

    .log-entry.warn {
      color: var(--warning-color);
    }

    .divider {
      height: 1px;
      background: var(--border-default);
      margin: var(--spacing-4) 0;
    }

    .footer {
      margin-top: auto;
      padding-top: var(--spacing-3);
      border-top: 1px solid var(--border-default);
      text-align: center;
      color: var(--text-muted);
      font-size: var(--font-size-xs);
    }

    .hidden {
      display: none !important;
    }
  `,

  // HTML template
  template: `
    <div class="panel-header">
      <h2>State Controller Installer</h2>
      <div class="version">Core Package: <span id="core-version">--</span></div>
    </div>

    <!-- Installation Status -->
    <div class="section">
      <div class="section-title">Installation Status</div>
      <div id="status-card" class="status-card not-installed">
        <div class="status-title">
          <span class="icon" id="status-icon">[?]</span>
          <span id="status-text">Checking...</span>
        </div>
        <div class="status-detail" id="status-detail">
          Checking installation status...
        </div>
      </div>
    </div>

    <!-- Installation Path -->
    <div class="section">
      <div class="section-title">Installation Path</div>
      <div class="form-group">
        <label>Target Directory:</label>
        <div class="path-input-group">
          <ui-input id="target-path" placeholder="Select target directory..." readonly></ui-input>
          <ui-button id="browse-btn" class="browse-btn">Browse</ui-button>
        </div>
      </div>
      <div class="status-detail">
        Default: assets/Controller in current project
      </div>
    </div>

    <!-- Version Info -->
    <div class="section" id="version-section">
      <div class="section-title">Version Information</div>
      <div class="version-info">
        <span class="version-label">Installed Version:</span>
        <span class="version-value" id="installed-version">--</span>
      </div>
      <div class="version-info">
        <span class="version-label">Available Version:</span>
        <span class="version-value" id="available-version">--</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="section">
      <div class="section-title">Actions</div>
      <div class="button-group">
        <ui-button id="install-btn" class="primary">Install</ui-button>
        <ui-button id="update-btn" class="primary hidden">Update</ui-button>
        <ui-button id="reinstall-btn" class="hidden">Reinstall</ui-button>
        <ui-button id="uninstall-btn" class="danger hidden">Uninstall</ui-button>
      </div>
    </div>

    <!-- Progress -->
    <div id="progress-container" class="progress-container">
      <div class="section-title">Progress</div>
      <div class="progress-bar">
        <div id="progress-fill" class="progress-fill"></div>
      </div>
      <div id="progress-text" class="progress-text">Ready</div>
    </div>

    <!-- Log -->
    <div id="log-container" class="log-container"></div>

    <!-- Footer -->
    <div class="footer">
      ccc-state-controller v1.0.0 | State Controller Installer
    </div>
  `,

  // Element bindings
  $: {
    statusCard: '#status-card',
    statusIcon: '#status-icon',
    statusText: '#status-text',
    statusDetail: '#status-detail',
    targetPath: '#target-path',
    browseBtn: '#browse-btn',
    coreVersion: '#core-version',
    installedVersion: '#installed-version',
    availableVersion: '#available-version',
    versionSection: '#version-section',
    installBtn: '#install-btn',
    updateBtn: '#update-btn',
    reinstallBtn: '#reinstall-btn',
    uninstallBtn: '#uninstall-btn',
    progressContainer: '#progress-container',
    progressFill: '#progress-fill',
    progressText: '#progress-text',
    logContainer: '#log-container'
  },

  // Panel ready - initialization
  ready() {
    // Store state
    this._state = {
      isInstalled: false,
      isInstalling: false,
      currentVersion: null,
      availableVersion: null,
      targetPath: '',
      corePath: ''
    };

    // Bind event handlers
    this._bindEvents();

    // Initialize
    this._initialize();
  },

  // Bind UI events
  _bindEvents() {
    // Browse button - open directory selection dialog
    this.$browseBtn.addEventListener('confirm', () => {
      this._selectTargetPath();
    });

    // Install button
    this.$installBtn.addEventListener('confirm', () => {
      this._handleInstall();
    });

    // Update button
    this.$updateBtn.addEventListener('confirm', () => {
      this._handleUpdate();
    });

    // Reinstall button
    this.$reinstallBtn.addEventListener('confirm', () => {
      this._handleReinstall();
    });

    // Uninstall button
    this.$uninstallBtn.addEventListener('confirm', () => {
      this._handleUninstall();
    });
  },

  // Initialize panel
  _initialize() {
    // Request initialization data from main process
    Editor.Ipc.sendToMain('ccc-state-controller:init-panel', (error, result) => {
      if (error) {
        this._log('Error initializing panel: ' + error.message, 'error');
        return;
      }

      if (result) {
        this._state.corePath = result.corePath || '';
        this._state.targetPath = result.targetPath || '';
        this._state.availableVersion = result.coreVersion || '1.0.0';

        // Update UI
        this.$coreVersion.innerText = this._state.availableVersion;
        this.$availableVersion.innerText = this._state.availableVersion;

        if (this._state.targetPath) {
          this.$targetPath.value = this._state.targetPath;
        }

        // Check installation status
        this._checkInstallationStatus();
      }
    });
  },

  // Select target path
  _selectTargetPath() {
    Editor.Ipc.sendToMain('ccc-state-controller:select-directory', (error, result) => {
      if (error) {
        this._log('Error selecting directory: ' + error.message, 'error');
        return;
      }

      if (result && result.path) {
        this._state.targetPath = result.path;
        this.$targetPath.value = result.path;
        this._checkInstallationStatus();
      }
    });
  },

  // Check installation status
  _checkInstallationStatus() {
    if (!this._state.targetPath) {
      this._updateStatusUI('not-installed', 'No target path selected', 'Please select a target directory');
      return;
    }

    this._log('Checking installation status...', 'info');

    Editor.Ipc.sendToMain('ccc-state-controller:get-status', this._state.targetPath, (error, result) => {
      if (error) {
        this._log('Error checking status: ' + error.message, 'error');
        this._updateStatusUI('error', 'Error', error.message);
        return;
      }

      this._state.isInstalled = result.installed;
      this._state.currentVersion = result.version;

      if (result.installed) {
        this.$installedVersion.innerText = result.version;

        // Check for update
        const updateAvailable = this._compareVersions(result.version, this._state.availableVersion) < 0;

        if (updateAvailable) {
          this._updateStatusUI('update-available', 'Update Available',
            `Version ${this._state.availableVersion} is available (installed: ${result.version})`);
        } else {
          this._updateStatusUI('installed', 'Installed',
            `Version ${result.version} is installed and up-to-date`);
        }
      } else {
        this.$installedVersion.innerText = 'Not installed';
        this._updateStatusUI('not-installed', 'Not Installed',
          'Click Install to add State Controller to your project');
      }

      this._updateButtons();
    });
  },

  // Handle install
  _handleInstall() {
    if (this._state.isInstalling) return;

    this._startOperation('Installing...');

    Editor.Ipc.sendToMain('ccc-state-controller:install', this._state.targetPath, (error, result) => {
      this._finishOperation();

      if (error) {
        this._log('Installation failed: ' + error.message, 'error');
        this._updateStatusUI('error', 'Installation Failed', error.message);
        return;
      }

      if (result.success) {
        this._log(`Installed version ${result.toVersion} successfully!`, 'success');
        this._log(`Files installed: ${result.files.length}`, 'info');
        this._state.currentVersion = result.toVersion;
        this._state.isInstalled = true;
        this.$installedVersion.innerText = result.toVersion;
        this._updateStatusUI('installed', 'Installed', `Version ${result.toVersion} installed successfully`);
      } else {
        this._log('Installation failed: ' + result.errors.join(', '), 'error');
        this._updateStatusUI('error', 'Installation Failed', result.errors.join(', '));
      }

      this._updateButtons();
    });
  },

  // Handle update
  _handleUpdate() {
    if (this._state.isInstalling) return;

    this._startOperation('Updating...');

    Editor.Ipc.sendToMain('ccc-state-controller:update', this._state.targetPath, (error, result) => {
      this._finishOperation();

      if (error) {
        this._log('Update failed: ' + error.message, 'error');
        this._updateStatusUI('error', 'Update Failed', error.message);
        return;
      }

      if (result.success) {
        this._log(`Updated from ${result.fromVersion} to ${result.toVersion}!`, 'success');
        this._state.currentVersion = result.toVersion;
        this.$installedVersion.innerText = result.toVersion;
        this._updateStatusUI('installed', 'Updated', `Version ${result.toVersion} installed successfully`);
      } else {
        this._log('Update failed: ' + result.errors.join(', '), 'error');
        if (result.action === 'none') {
          this._updateStatusUI('installed', 'Up-to-date', 'Already at the latest version');
        } else {
          this._updateStatusUI('error', 'Update Failed', result.errors.join(', '));
        }
      }

      this._updateButtons();
    });
  },

  // Handle reinstall
  _handleReinstall() {
    if (this._state.isInstalling) return;

    this._startOperation('Reinstalling...');

    Editor.Ipc.sendToMain('ccc-state-controller:reinstall', this._state.targetPath, (error, result) => {
      this._finishOperation();

      if (error) {
        this._log('Reinstall failed: ' + error.message, 'error');
        return;
      }

      if (result.success) {
        this._log(`Reinstalled version ${result.toVersion} successfully!`, 'success');
        this._updateStatusUI('installed', 'Installed', `Version ${result.toVersion} reinstalled successfully`);
      } else {
        this._log('Reinstall failed: ' + result.errors.join(', '), 'error');
      }
    });
  },

  // Handle uninstall
  _handleUninstall() {
    if (this._state.isInstalling) return;

    // Confirm uninstall
    const confirmed = confirm('Are you sure you want to uninstall State Controller?');
    if (!confirmed) return;

    this._startOperation('Uninstalling...');

    Editor.Ipc.sendToMain('ccc-state-controller:uninstall', this._state.targetPath, (error, result) => {
      this._finishOperation();

      if (error) {
        this._log('Uninstall failed: ' + error.message, 'error');
        return;
      }

      if (result.success) {
        this._log(`Uninstalled successfully (${result.removed} files removed)`, 'success');
        this._state.isInstalled = false;
        this._state.currentVersion = null;
        this.$installedVersion.innerText = 'Not installed';
        this._updateStatusUI('not-installed', 'Uninstalled', 'State Controller has been removed');
        this._updateButtons();
      } else {
        this._log('Uninstall failed: ' + result.errors.join(', '), 'error');
      }
    });
  },

  // Update status UI
  _updateStatusUI(status, title, detail) {
    // Update card class
    this.$statusCard.className = 'status-card ' + status;

    // Update icon
    const icons = {
      'installed': '[OK]',
      'not-installed': '[--]',
      'update-available': '[!]',
      'error': '[X]'
    };
    this.$statusIcon.innerText = icons[status] || '[?]';

    // Update text
    this.$statusText.innerText = title;
    this.$statusDetail.innerText = detail;
  },

  // Update button visibility
  _updateButtons() {
    if (this._state.isInstalled) {
      const isUpdateAvailable = this._compareVersions(this._state.currentVersion, this._state.availableVersion) < 0;

      this.$installBtn.classList.add('hidden');
      this.$reinstallBtn.classList.remove('hidden');
      this.$uninstallBtn.classList.remove('hidden');

      if (isUpdateAvailable) {
        this.$updateBtn.classList.remove('hidden');
      } else {
        this.$updateBtn.classList.add('hidden');
      }
    } else {
      this.$installBtn.classList.remove('hidden');
      this.$updateBtn.classList.add('hidden');
      this.$reinstallBtn.classList.add('hidden');
      this.$uninstallBtn.classList.add('hidden');
    }
  },

  // Start operation
  _startOperation(message) {
    this._state.isInstalling = true;
    this.$progressContainer.classList.add('visible');
    this.$progressFill.style.width = '0%';
    this.$progressText.innerText = message;

    // Disable buttons
    this.$installBtn.disabled = true;
    this.$updateBtn.disabled = true;
    this.$reinstallBtn.disabled = true;
    this.$uninstallBtn.disabled = true;

    // Animate progress
    this._animateProgress();
  },

  // Finish operation
  _finishOperation() {
    this._state.isInstalling = false;

    // Complete progress
    this.$progressFill.style.width = '100%';
    this.$progressText.innerText = 'Complete';

    // Hide progress after delay
    setTimeout(() => {
      this.$progressContainer.classList.remove('visible');
      this.$progressFill.style.width = '0%';
    }, 1500);

    // Enable buttons
    this.$installBtn.disabled = false;
    this.$updateBtn.disabled = false;
    this.$reinstallBtn.disabled = false;
    this.$uninstallBtn.disabled = false;
  },

  // Animate progress bar
  _animateProgress() {
    let progress = 0;
    const interval = setInterval(() => {
      if (!this._state.isInstalling) {
        clearInterval(interval);
        return;
      }

      progress += Math.random() * 15;
      if (progress > 90) progress = 90;

      this.$progressFill.style.width = progress + '%';
    }, 200);
  },

  // Log message
  _log(message, type = 'info') {
    this.$logContainer.classList.add('visible');

    const entry = document.createElement('div');
    entry.className = 'log-entry ' + type;
    entry.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;

    this.$logContainer.appendChild(entry);
    this.$logContainer.scrollTop = this.$logContainer.scrollHeight;
  },

  // Compare semantic versions
  _compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;

    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  },

  // IPC messages
  messages: {
    // Refresh status
    'ccc-state-controller:refresh'() {
      this._checkInstallationStatus();
    },

    // Update progress from main process
    'ccc-state-controller:progress'(event, data) {
      if (data.percent !== undefined) {
        this.$progressFill.style.width = data.percent + '%';
      }
      if (data.message) {
        this.$progressText.innerText = data.message;
      }
    },

    // Log message from main process
    'ccc-state-controller:log'(event, data) {
      this._log(data.message, data.type || 'info');
    }
  }
});
