'use strict';

// Extracted from panel/index.js - Do not edit index.js directly.
// Use `node panel/build.js` to assemble the final panel/index.js.
//
// M4 minimum-viable Dashboard + Installer logic. Config + Health tabs are placeholders;
// Gemini will implement the full UI in the M5 iteration based on the brief doc.

const { t } = require('../i18n-helper');
const logger = require('../logger');

const PKG_NAME = 'ccc-state-controller-workbench';

module.exports = {
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
};
