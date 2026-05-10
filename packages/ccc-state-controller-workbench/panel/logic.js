'use strict';

const PKG_NAME = 'ccc-state-controller-workbench';

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function getSeverityClass(tag) {
    if (['duplicate-name', 'missing-name', 'invalid-selected-index', 'orphan-controller', 'state-name-collision'].includes(tag)) return 'error';
    if (['no-states', 'no-controlled-props', 'dead-ctrl-data-refs'].includes(tag)) return 'warning';
    return 'info';
}

module.exports = {
    $: {
        globalRefreshBtn: '#global-refresh-btn',
        dashboardSummary: '#dashboard-summary',
        dashboardList: '#dashboard-list',
        
        installerSource: '#installer-source',
        installerTarget: '#installer-target',
        installerStatus: '#installer-status',
        installerRefreshBtn: '#installer-refresh-btn',
        installerInstallBtn: '#installer-install-btn',
        installerErrorBanner: '#installer-error-banner',
        installerErrorMsg: '#installer-error-msg',
        installerBackupPath: '#installer-backup-path',
        installerRetryBtn: '#installer-retry-btn',
        
        configCtrlSelect: '#config-ctrl-select',
        configWorkspace: '#config-workspace',
        configEmpty: '#config-empty',
        newStateName: '#new-state-name',
        addStateBtn: '#add-state-btn',
        copySrcState: '#copy-src-state',
        copyDstState: '#copy-dst-state',
        copyPropsBtn: '#copy-props-btn',
        configStatesList: '#config-states-list',
        configStateDetails: '#config-state-details',
        currentDetailsState: '#current-details-state',
        configPropsList: '#config-props-list',
        
        healthSummary: '#health-summary',
        healthIssuesList: '#health-issues-list',
    },

    ready() {
        this.currentGraph = null;
        this.currentCtrlId = null;
        this.currentStateId = null;

        const root = this.shadowRoot || document;
        
        // Tab switching
        const tabContents = root.querySelectorAll('.panel-tab-content');
        const tabButtons = root.querySelectorAll('.panel-tab-btn');
        for (const btn of tabButtons) {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                for (const b of tabButtons) b.classList.remove('active');
                for (const c of tabContents) c.classList.remove('active');
                btn.classList.add('active');
                const target = root.querySelector(`#tab-${tabId}`);
                if (target) target.classList.add('active');
                if (tabId === 'health') this.refreshHealth();
            });
        }

        if (this.globalRefreshBtn) this.globalRefreshBtn.addEventListener('click', () => this.refreshAll());

        // Installer
        if (this.installerRefreshBtn) this.installerRefreshBtn.addEventListener('click', () => this.refreshInstallerStatus());
        if (this.installerInstallBtn) this.installerInstallBtn.addEventListener('click', () => this.runInstaller());
        if (this.installerRetryBtn) this.installerRetryBtn.addEventListener('click', () => this.runInstaller());

        // Config
        if (this.configCtrlSelect) {
            this.configCtrlSelect.addEventListener('change', (e) => {
                this.currentCtrlId = e.target.value ? parseInt(e.target.value, 10) : null;
                this.currentStateId = null;
                this.renderConfigWorkspace();
            });
        }
        if (this.addStateBtn) {
            this.addStateBtn.addEventListener('click', () => {
                if (this.currentCtrlId == null) return;
                const name = this.newStateName.value.trim();
                if (!name) return;
                Editor.Scene.callSceneScript(PKG_NAME, 'add-state', { ctrlId: this.currentCtrlId, stateName: name }, (err) => {
                    if (!err) {
                        this.newStateName.value = '';
                        this.refreshAll();
                    }
                });
            });
        }
        if (this.copyPropsBtn) {
            this.copyPropsBtn.addEventListener('click', () => {
                if (this.currentCtrlId == null) return;
                const src = parseInt(this.copySrcState.value, 10);
                const dst = parseInt(this.copyDstState.value, 10);
                if (isNaN(src) || isNaN(dst) || src === dst) return;
                Editor.Scene.callSceneScript(PKG_NAME, 'copy-state-props', { srcCtrlId: this.currentCtrlId, srcStateId: src, dstStateId: dst }, (err) => {
                    if (!err) this.refreshAll();
                });
            });
        }

        this.debouncedSetStateName = debounce(this.doSetStateName.bind(this), 300);
        this.debouncedSetPropValue = debounce(this.doSetPropValue.bind(this), 500);

        this.refreshAll();
    },

    refreshAll() {
        this.refreshDashboard();
        this.refreshHealth();
    },

    refreshDashboard() {
        Editor.Scene.callSceneScript(PKG_NAME, 'list-controllers', {}, (err, graph) => {
            if (err || !graph) {
                if (this.dashboardSummary) this.dashboardSummary.textContent = 'Failed to load: ' + (err && err.message || 'unknown');
                return;
            }
            this.currentGraph = graph;
            this.renderDashboard();
            this.renderConfigDropdown();
            this.renderConfigWorkspace();
        });
    },

    renderDashboard() {
        const graph = this.currentGraph;
        if (!graph || !this.dashboardSummary || !this.dashboardList) return;
        const s = graph.summary || {};
        this.dashboardSummary.textContent =
            `Controllers: ${s.controllerCount || 0}  |  Selects: ${s.selectCount || 0}  |  ` +
            `Issues: ${s.controllersWithIssues || 0}  |  Orphans: ${s.orphanSelectCount || 0}`;
        const html = (graph.controllers || []).map((c) => {
            const badges = (c.anomalies || []).map((a) => `<span class="anomaly-badge ${getSeverityClass(a)}">${escapeHtml(a)}</span>`).join('');
            return `<div class="controller-row" data-uuid="${escapeHtml(c.nodeUuid)}"><strong>${escapeHtml(c.ctrlName || '(no name)')}</strong> [id=${c.ctrlId}] selectedIndex=${c.selectedIndex} states=${(c.states || []).length} ${badges}</div>`;
        }).join('');
        this.dashboardList.innerHTML = html || '<div class="empty-state">No controllers in scene.</div>';

        const root = this.shadowRoot || document;
        const rows = root.querySelectorAll('#dashboard-list .controller-row');
        for (const row of rows) {
            row.addEventListener('click', () => {
                const uuid = row.getAttribute('data-uuid');
                if (uuid && Editor.Selection) {
                    Editor.Selection.select('node', [uuid]);
                }
            });
        }
    },

    refreshInstallerStatus() {
        Editor.Scene.callSceneScript(PKG_NAME, 'get-runtime-status', {}, (err, status) => {
            if (err || !status) {
                if (this.installerStatus) this.installerStatus.textContent = 'Status check failed.';
                return;
            }
            if (this.installerStatus) {
                this.installerStatus.textContent =
                    `source=${status.source}\ntarget=${status.target}\nmissing=${status.missing.length} files\nmodified=${status.modified.length} files`;
            }
        });
    },

    runInstaller() {
        if (this.installerErrorBanner) this.installerErrorBanner.style.display = 'none';
        if (this.installerStatus) this.installerStatus.textContent = 'Installing...';
        
        Editor.Scene.callSceneScript(PKG_NAME, 'install-runtime', {}, (err, result) => {
            if (err) {
                if (this.installerStatus) this.installerStatus.textContent = `ERROR: ${err.message}`;
                return;
            }
            
            if (result.action === 'failed' && result.rolledBack) {
                if (this.installerErrorBanner) {
                    this.installerErrorBanner.style.display = 'flex';
                    if (this.installerErrorMsg) this.installerErrorMsg.textContent = `Install Failed: ${result.error || 'Unknown error'}`;
                    if (this.installerBackupPath) this.installerBackupPath.textContent = `Backup path: ${result.backupPath || '(none)'}`;
                }
                if (this.installerStatus) this.installerStatus.textContent = 'Installation rolled back.';
            } else {
                if (this.installerStatus) {
                    this.installerStatus.textContent = `Result: ${result.action}\nFiles affected: ${(result.filesAffected || []).length}\nBackup path: ${result.backupPath || '(none)'}`;
                }
            }
            this.refreshInstallerStatus();
        });
    },

    renderConfigDropdown() {
        if (!this.configCtrlSelect || !this.currentGraph) return;
        const ctrls = this.currentGraph.controllers || [];
        let html = '<option value="">-- Select Controller --</option>';
        for (const c of ctrls) {
            const sel = (this.currentCtrlId === c.ctrlId) ? 'selected' : '';
            html += `<option value="${c.ctrlId}" ${sel}>${escapeHtml(c.ctrlName || '(no name)')} [${c.ctrlId}]</option>`;
        }
        this.configCtrlSelect.innerHTML = html;
        if (!ctrls.find(c => c.ctrlId === this.currentCtrlId)) {
            this.currentCtrlId = null;
        }
    },

    renderConfigWorkspace() {
        if (!this.configWorkspace || !this.configEmpty || !this.currentGraph) return;
        
        if (this.currentCtrlId == null) {
            this.configWorkspace.style.display = 'none';
            this.configEmpty.style.display = 'block';
            return;
        }

        const ctrl = this.currentGraph.controllers.find(c => c.ctrlId === this.currentCtrlId);
        if (!ctrl) {
            this.currentCtrlId = null;
            this.configWorkspace.style.display = 'none';
            this.configEmpty.style.display = 'block';
            return;
        }

        this.configWorkspace.style.display = 'block';
        this.configEmpty.style.display = 'none';

        // Render states
        const states = ctrl.states || [];
        let statesHtml = '';
        let copyOptionsHtml = '';
        for (const st of states) {
            const isSel = (this.currentStateId === st.stateId) ? 'selected' : '';
            statesHtml += `
                <div class="state-item ${isSel}" data-stateid="${st.stateId}">
                    <span style="width:20px;color:#888;">${st.stateId}</span>
                    <input type="text" value="${escapeHtml(st.name)}" data-stateid="${st.stateId}" class="state-name-input" />
                    <button class="state-btn-del" data-stateid="${st.stateId}" title="Delete state">&times;</button>
                </div>`;
            copyOptionsHtml += `<option value="${st.stateId}">${escapeHtml(st.name)} [${st.stateId}]</option>`;
        }
        
        if (this.configStatesList) this.configStatesList.innerHTML = statesHtml || '<div class="empty-state">No states.</div>';
        if (this.copySrcState) this.copySrcState.innerHTML = copyOptionsHtml;
        if (this.copyDstState) this.copyDstState.innerHTML = copyOptionsHtml;

        const root = this.shadowRoot || document;
        
        // State actions
        const stateItems = root.querySelectorAll('.state-item');
        for (const item of stateItems) {
            item.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
                this.currentStateId = parseInt(item.getAttribute('data-stateid'), 10);
                this.renderConfigWorkspace();
            });
        }

        const nameInputs = root.querySelectorAll('.state-name-input');
        for (const input of nameInputs) {
            input.addEventListener('input', (e) => {
                const stId = parseInt(e.target.getAttribute('data-stateid'), 10);
                this.debouncedSetStateName(this.currentCtrlId, stId, e.target.value);
            });
        }

        const delBtns = root.querySelectorAll('.state-btn-del');
        for (const btn of delBtns) {
            btn.addEventListener('click', (e) => {
                const stId = parseInt(e.target.getAttribute('data-stateid'), 10);
                if (confirm('Delete state? This will remove properties configured for this state.')) {
                    Editor.Scene.callSceneScript(PKG_NAME, 'delete-state', { ctrlId: this.currentCtrlId, stateId: stId }, (err) => {
                        if (!err) {
                            if (this.currentStateId === stId) this.currentStateId = null;
                            this.refreshAll();
                        }
                    });
                }
            });
        }

        // Render props for selected state
        if (this.currentStateId != null) {
            const stObj = states.find(s => s.stateId === this.currentStateId);
            if (this.currentDetailsState) this.currentDetailsState.textContent = stObj ? stObj.name : '';
            this.configStateDetails.style.display = 'block';
            
            const selects = (this.currentGraph.selects || []).filter(s => s.currCtrlId === this.currentCtrlId);
            let propsHtml = '';
            for (const sel of selects) {
                const ctrlData = sel._ctrlData || {};
                const myCtrlData = ctrlData[this.currentCtrlId] || {};
                const myStateData = myCtrlData[this.currentStateId] || {};
                
                for (const propType of Object.keys(myStateData)) {
                    const val = myStateData[propType];
                    const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    propsHtml += `
                        <div class="prop-item">
                            <div class="prop-node" title="${escapeHtml(sel.nodeName)}">${escapeHtml(sel.nodeName)}</div>
                            <div class="prop-type" title="Prop Type ${escapeHtml(propType)}">T:${escapeHtml(propType)}</div>
                            <div class="prop-val">
                                <input type="text" value="${escapeHtml(valStr)}" data-uuid="${escapeHtml(sel.nodeUuid)}" data-proptype="${escapeHtml(propType)}" class="prop-val-input" />
                            </div>
                        </div>`;
                }
            }
            if (this.configPropsList) this.configPropsList.innerHTML = propsHtml || '<div class="empty-state">No property overrides for this state.</div>';
            
            const valInputs = root.querySelectorAll('.prop-val-input');
            for (const input of valInputs) {
                input.addEventListener('input', (e) => {
                    const uuid = e.target.getAttribute('data-uuid');
                    const pType = e.target.getAttribute('data-proptype');
                    const valStr = e.target.value;
                    let parsedVal = valStr;
                    try { parsedVal = JSON.parse(valStr); } catch (err) { /* keep as string */ }
                    this.debouncedSetPropValue(uuid, this.currentCtrlId, this.currentStateId, pType, parsedVal);
                });
            }
            
        } else {
            this.configStateDetails.style.display = 'none';
        }
    },

    doSetStateName(ctrlId, stateId, newName) {
        Editor.Scene.callSceneScript(PKG_NAME, 'set-state-name', { ctrlId, stateId, newName }, (err) => {
            if (!err) this.refreshDashboard(); // soft refresh, avoid losing focus if possible?
        });
    },

    doSetPropValue(nodeUuid, ctrlId, stateId, propType, value) {
        Editor.Scene.callSceneScript(PKG_NAME, 'set-prop-value', { nodeUuid, ctrlId, stateId, propType, value }, (err) => {
            if (!err) this.refreshDashboard();
        });
    },

    refreshHealth() {
        Editor.Scene.callSceneScript(PKG_NAME, 'health-detect', {}, (err, res) => {
            if (err || !res) {
                // Client-side fallback if RPC fails
                this.fallbackHealthDetect();
                return;
            }
            this.renderHealth(res.issues || []);
        });
    },

    fallbackHealthDetect() {
        if (!this.currentGraph) return;
        const issues = [];
        for (const c of (this.currentGraph.controllers || [])) {
            for (const a of (c.anomalies || [])) {
                issues.push({ type: a, controllerCtrlId: c.ctrlId, severity: getSeverityClass(a) === 'error' ? 'error' : 'warning', autofix: false, suggestedAction: 'Manual intervention required.' });
            }
        }
        for (const s of (this.currentGraph.orphanSelects || [])) {
            issues.push({ type: 'orphan-controller', nodeUuid: s.nodeUuid, severity: 'warning', autofix: true, suggestedAction: 'Run cleanup to reset.' });
        }
        this.renderHealth(issues);
    },

    renderHealth(issues) {
        if (!this.healthSummary || !this.healthIssuesList) return;
        
        let errs = 0, warns = 0, infos = 0;
        for (const is of issues) {
            if (is.severity === 'error') errs++;
            else if (is.severity === 'warning') warns++;
            else infos++;
        }
        
        this.healthSummary.textContent = `Errors: ${errs} | Warnings: ${warns} | Infos: ${infos}`;
        
        let html = '';
        for (const is of issues) {
            const fixHtml = is.autofix ? `<button class="issue-fix-btn primary" data-type="${escapeHtml(is.type)}">Fix</button>` : '';
            const sevClass = is.severity || 'info';
            const detailStr = is.controllerCtrlId != null ? `Ctrl [${is.controllerCtrlId}]` : (is.nodeUuid ? `Node: ${is.nodeUuid}` : '');
            
            html += `
                <div class="issue-row ${sevClass}">
                    <div class="issue-info">
                        <div class="issue-desc"><span class="anomaly-badge ${sevClass}">${escapeHtml(is.type)}</span> ${escapeHtml(is.suggestedAction || '')}</div>
                        <div class="issue-detail">${escapeHtml(detailStr)}</div>
                    </div>
                    ${fixHtml}
                </div>`;
        }
        this.healthIssuesList.innerHTML = html || '<div class="empty-state">No issues detected. System is healthy.</div>';

        const root = this.shadowRoot || document;
        const fixBtns = root.querySelectorAll('.issue-fix-btn');
        for (const btn of fixBtns) {
            btn.addEventListener('click', (e) => {
                const type = e.target.getAttribute('data-type');
                if (type === 'orphan-controller' || type === 'dead-ctrl-data-refs') {
                    Editor.Scene.callSceneScript(PKG_NAME, 'cleanup-orphans', {}, (err, res) => {
                        this.refreshAll();
                    });
                } else if (type === 'state-name-collision') {
                    // if there's a specific health-fix we could call it, otherwise trigger refresh
                    this.refreshAll();
                }
            });
        }
    },

    messages: {
        'res-list-controllers'(event, graph) {
            this.currentGraph = graph;
            this.renderDashboard();
            this.renderConfigDropdown();
            this.renderConfigWorkspace();
        },
    },
};
