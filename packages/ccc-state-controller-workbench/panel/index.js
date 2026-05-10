

// panel/index.js, this filename needs to match the one registered in package.json

//
// M4 minimum-viable Dashboard + Installer logic. Config + Health tabs are placeholders;
// Gemini will implement the full UI in the M5 iteration based on the brief doc.
const { t } = require('../i18n-helper');
const logger = require('../logger');
const PKG_NAME = 'ccc-state-controller-workbench';

Editor.Panel.extend({
  // css style for panel - 现代化设计
  style: `
    .panel-root {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        padding: 12px;
        background: #2b2b2b;
        color: #ddd;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Microsoft YaHei", sans-serif;
    }

    .panel-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
    .panel-tab-btn { padding: 4px 12px; background: #3c3c3c; border: 1px solid #555; cursor: pointer; }
    .panel-tab-btn.active { background: #5a5a5a; }
    .panel-tab-content { display: none; }
    .panel-tab-content.active { display: block; }
    .anomaly-badge { display: inline-block; padding: 2px 6px; margin-right: 4px; font-size: 10px; background: #b94a48; color: #fff; border-radius: 2px; }
    .controller-row { padding: 6px 0; border-bottom: 1px solid #444; }
    .empty-state { color: #888; font-style: italic; }

  `,

  // html template for panel
  template: `
    <div class="panel-root">
        <div class="panel-tabs">
            <div class="panel-tab-btn active" data-tab="dashboard">Dashboard</div>
            <div class="panel-tab-btn" data-tab="installer">Installer</div>
            <div class="panel-tab-btn" data-tab="config">Config</div>
            <div class="panel-tab-btn" data-tab="health">Health</div>
        </div>

        <div id="tab-dashboard" class="panel-tab-content active">
            <div id="dashboard-summary" class="empty-state">Loading…</div>
            <div id="dashboard-list"></div>
        </div>

        <div id="tab-installer" class="panel-tab-content">
            <div id="installer-status" class="empty-state">Click below to inspect runtime status.</div>
            <button id="installer-refresh-btn">Refresh status</button>
            <button id="installer-install-btn">Install runtime</button>
            <pre id="installer-log" style="margin-top:8px;color:#aaa;"></pre>
        </div>

        <div id="tab-config" class="panel-tab-content">
            <div class="empty-state">M4 placeholder. Filled by Gemini in M5 iteration.</div>
        </div>

        <div id="tab-health" class="panel-tab-content">
            <div class="empty-state">M4 placeholder. Filled by Gemini in M5 iteration.</div>
        </div>
    </div>

  `,

    $: {
        tabBtns: '.panel-tab-btn',
        dashboardSummary: '#dashboard-summary',
        dashboardList: '#dashboard-list',
        installerStatus: '#installer-status',
        installerLog: '#installer-log',
        installerRefreshBtn: '#installer-refresh-btn',
        installerInstallBtn: '#installer-install-btn',
    },

    ready() {
        // Tab switching
        const tabContents = this.shadowRoot ? this.shadowRoot.querySelectorAll('.panel-tab-content') : document.querySelectorAll('.panel-tab-content');
        const tabButtons = this.shadowRoot ? this.shadowRoot.querySelectorAll('.panel-tab-btn') : document.querySelectorAll('.panel-tab-btn');
        for (const btn of tabButtons) {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                for (const b of tabButtons) b.classList.remove('active');
                for (const c of tabContents) c.classList.remove('active');
                btn.classList.add('active');
                const target = (this.shadowRoot || document).querySelector(`#tab-${tabId}`);
                if (target) target.classList.add('active');
            });
        }

        // Initial dashboard load
        this.refreshDashboard();

        // Installer buttons
        if (this.installerRefreshBtn) this.installerRefreshBtn.addEventListener('click', () => this.refreshInstallerStatus());
        if (this.installerInstallBtn) this.installerInstallBtn.addEventListener('click', () => this.runInstaller());
    },

    refreshDashboard() {
        Editor.Scene.callSceneScript(PKG_NAME, 'list-controllers', {}, (err, graph) => {
            if (err || !graph) {
                if (this.dashboardSummary) this.dashboardSummary.textContent = 'Failed to load: ' + (err && err.message || 'unknown');
                return;
            }
            this.renderDashboard(graph);
        });
    },

    renderDashboard(graph) {
        if (!this.dashboardSummary || !this.dashboardList) return;
        const s = graph.summary || {};
        this.dashboardSummary.textContent =
            `Controllers: ${s.controllerCount || 0}  |  Selects: ${s.selectCount || 0}  |  ` +
            `Issues: ${s.controllersWithIssues || 0}  |  Orphans: ${s.orphanSelectCount || 0}`;
        const html = (graph.controllers || []).map((c) => {
            const badges = (c.anomalies || []).map((a) => `<span class="anomaly-badge">${a}</span>`).join('');
            return `<div class="controller-row"><strong>${c.ctrlName || '(no name)'}</strong> [id=${c.ctrlId}] selectedIndex=${c.selectedIndex} states=${(c.states || []).length} ${badges}</div>`;
        }).join('');
        this.dashboardList.innerHTML = html || '<div class="empty-state">No controllers in scene.</div>';
    },

    refreshInstallerStatus() {
        Editor.Scene.callSceneScript(PKG_NAME, 'get-runtime-status', {}, (err, status) => {
            if (err || !status) {
                if (this.installerStatus) this.installerStatus.textContent = 'Status check failed.';
                return;
            }
            if (this.installerStatus) {
                this.installerStatus.textContent =
                    `source=${status.source}\ntarget=${status.target}\nmissing=${status.missing.length}\nmodified=${status.modified.length}`;
            }
        });
    },

    runInstaller() {
        Editor.Scene.callSceneScript(PKG_NAME, 'install-runtime', {}, (err, result) => {
            if (this.installerLog) {
                this.installerLog.textContent = err
                    ? `ERROR: ${err.message}`
                    : `action=${result.action}  filesAffected=${(result.filesAffected || []).length}  backup=${result.backupPath || '(none)'}`;
            }
        });
    },

    messages: {
        'res-list-controllers'(event, graph) {
            this.renderDashboard(graph);
        },
    },
});
