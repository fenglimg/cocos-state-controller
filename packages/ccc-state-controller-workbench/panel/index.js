

// panel/index.js, this filename needs to match the one registered in package.json

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
function reply(event, err, result) {
    if (event && typeof event.reply === 'function') {
        event.reply(err || null, result);
    }
}

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
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .panel-tabs { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
    .panel-tab-btn { padding: 4px 12px; background: #3c3c3c; border: 1px solid #555; cursor: pointer; border-radius: 4px; }
    .panel-tab-btn:hover { background: #5a5a5a; }
    .panel-tab-btn.active { background: #5a5a5a; border-color: #777; font-weight: bold; }
    .panel-tab-content { display: none; flex: 1; overflow-y: auto; }
    .panel-tab-content.active { display: block; }

    .refresh-btn { margin-left: auto; background: #444; color: #fff; border: 1px solid #555; padding: 4px 8px; cursor: pointer; border-radius: 4px; }
    .refresh-btn:hover { background: #555; }

    .summary-card { padding: 8px; background: #333; border: 1px solid #444; margin-bottom: 8px; border-radius: 4px; }
    .list-container { display: flex; flex-direction: column; gap: 4px; }

    .anomaly-badge { display: inline-block; padding: 2px 6px; margin-right: 4px; font-size: 10px; color: #fff; border-radius: 2px; }
    .anomaly-badge.error { background: #b94a48; }
    .anomaly-badge.warning { background: #d9822b; }
    .anomaly-badge.info { background: #3a87ad; }

    .controller-row { padding: 8px; border: 1px solid #444; background: #333; border-radius: 4px; cursor: pointer; }
    .controller-row:hover { background: #3c3c3c; }

    .empty-state { color: #888; font-style: italic; padding: 8px; text-align: center; }

    /* Installer */
    .form-group { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .form-group label { width: 80px; text-align: right; }
    .form-group input { flex: 1; background: #3c3c3c; border: 1px solid #555; color: #ddd; padding: 4px; border-radius: 4px; }
    .actions { display: flex; gap: 8px; margin-bottom: 8px; justify-content: flex-end; }
    button { background: #3c3c3c; border: 1px solid #555; color: #ddd; padding: 4px 12px; border-radius: 4px; cursor: pointer; }
    button:hover { background: #5a5a5a; }
    button.primary { background: #3a87ad; color: #fff; border-color: #2b6a8a; }
    button.primary:hover { background: #4b98be; }
    .status-box { padding: 8px; background: #222; border: 1px solid #444; font-family: monospace; white-space: pre-wrap; margin-bottom: 8px; border-radius: 4px; }
    .error-banner { background: #4a2323; border: 1px solid #b94a48; padding: 8px; border-radius: 4px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 8px; }
    .backup-path { font-family: monospace; color: #d9822b; font-size: 11px; }

    /* Config */
    .config-header { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #444; }
    .config-header select { flex: 1; background: #3c3c3c; border: 1px solid #555; color: #ddd; padding: 4px; border-radius: 4px; }

    .states-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .add-state-box { display: flex; gap: 4px; }
    .add-state-box input { background: #3c3c3c; border: 1px solid #555; color: #ddd; padding: 4px; width: 120px; border-radius: 4px; }

    .copy-props-box { display: flex; gap: 4px; align-items: center; background: #333; padding: 6px; border-radius: 4px; margin-bottom: 8px; }
    .copy-props-box select { background: #3c3c3c; border: 1px solid #555; color: #ddd; padding: 2px; border-radius: 4px; max-width: 100px;}

    .states-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; max-height: 120px; overflow-y: auto; border: 1px solid #444; padding: 4px; border-radius: 4px; }
    .state-item { display: flex; gap: 8px; align-items: center; padding: 4px; background: #3c3c3c; border-radius: 4px; cursor: pointer; border: 1px solid transparent; }
    .state-item:hover { background: #444; }
    .state-item.selected { border-color: #3a87ad; background: #2b3a42; }
    .state-item input { flex: 1; background: transparent; border: none; color: #ddd; padding: 2px; }
    .state-item input:focus { background: #222; outline: 1px solid #555; }
    .state-btn-del { color: #b94a48; cursor: pointer; border: none; background: transparent; padding: 0 4px; }
    .state-btn-del:hover { color: #ff6b68; }

    .state-details { border-top: 1px solid #444; padding-top: 8px; }
    .state-details-header { font-weight: bold; margin-bottom: 8px; color: #3a87ad; }
    .props-list { display: flex; flex-direction: column; gap: 4px; }
    .prop-item { display: flex; gap: 8px; padding: 4px; background: #333; border-radius: 4px; align-items: center; }
    .prop-node { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
    .prop-type { width: 60px; color: #888; font-size: 11px; }
    .prop-val { width: 100px; }
    .prop-val input { width: 100%; background: #222; border: 1px solid #555; color: #ddd; padding: 4px; box-sizing: border-box; border-radius: 4px; }

    /* Health */
    .issue-row { padding: 8px; border: 1px solid #444; background: #333; margin-bottom: 4px; border-radius: 4px; display: flex; justify-content: space-between; align-items: flex-start; border-left: 4px solid #555; }
    .issue-row.error { border-left-color: #b94a48; }
    .issue-row.warning { border-left-color: #d9822b; }
    .issue-row.info { border-left-color: #3a87ad; }
    .issue-info { flex: 1; overflow: hidden; }
    .issue-desc { margin-bottom: 4px; font-weight: bold; }
    .issue-detail { font-size: 11px; color: #aaa; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .issue-fix-btn { margin-left: 8px; flex-shrink: 0; }

  `,

  // html template for panel
  template: `
    <div class="panel-root">
        <div class="panel-tabs">
            <div class="panel-tab-btn active" data-tab="dashboard">Dashboard</div>
            <div class="panel-tab-btn" data-tab="installer">Installer</div>
            <div class="panel-tab-btn" data-tab="config">Config</div>
            <div class="panel-tab-btn" data-tab="health">Health</div>
            <button id="global-refresh-btn" class="refresh-btn" title="Refresh Data">↻ Refresh</button>
        </div>

        <!-- Dashboard -->
        <div id="tab-dashboard" class="panel-tab-content active">
            <div id="dashboard-summary" class="summary-card">Loading…</div>
            <div id="dashboard-list" class="list-container"></div>
        </div>

        <!-- Installer -->
        <div id="tab-installer" class="panel-tab-content">
            <div class="form-group">
                <label>Source:</label>
                <input type="text" id="installer-source" readonly value="packages/ccc-state-controller-workbench/lib/runtime" />
            </div>
            <div class="form-group">
                <label>Target:</label>
                <input type="text" id="installer-target" readonly value="assets/script/controller" />
            </div>
            <div class="actions">
                <button id="installer-refresh-btn">Refresh Status</button>
                <button id="installer-install-btn" class="primary">Install Runtime</button>
            </div>
            <div id="installer-error-banner" class="error-banner" style="display:none">
                <div id="installer-error-msg"></div>
                <div id="installer-backup-path" class="backup-path"></div>
                <button id="installer-retry-btn">Retry Install</button>
            </div>
            <div id="installer-status" class="status-box empty-state">Click Refresh to inspect runtime status.</div>
        </div>

        <!-- Config -->
        <div id="tab-config" class="panel-tab-content">
            <div class="config-header">
                <label>Controller:</label>
                <select id="config-ctrl-select">
                    <option value="">-- Select Controller --</option>
                </select>
            </div>
            
            <div id="config-workspace" style="display:none;">
                <div class="states-header">
                    <strong>States</strong>
                    <div class="add-state-box">
                        <input type="text" id="new-state-name" placeholder="New state name" />
                        <button id="add-state-btn">Add</button>
                    </div>
                </div>
                
                <div class="copy-props-box">
                    <label>Copy Props:</label>
                    <select id="copy-src-state"></select>
                    <span>&rarr;</span>
                    <select id="copy-dst-state"></select>
                    <button id="copy-props-btn">Copy</button>
                </div>

                <div id="config-states-list" class="states-list"></div>
                
                <div id="config-state-details" class="state-details">
                    <div class="state-details-header">Prop Overrides for State: <span id="current-details-state"></span></div>
                    <div id="config-props-list" class="props-list"></div>
                </div>
            </div>
            <div id="config-empty" class="empty-state">Select a controller to configure states.</div>
        </div>

        <!-- Health -->
        <div id="tab-health" class="panel-tab-content">
            <div id="health-summary" class="summary-card">Checking health...</div>
            <div id="health-issues-list" class="list-container"></div>
        </div>
    </div>

  `,

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

    listControllers(callback) {
        Editor.Scene.callSceneScript(PKG_NAME, 'list-controllers', {}, callback);
    },

    refreshDashboard() {
        this.listControllers((err, graph) => {
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

    detectHealth(callback) {
        Editor.Scene.callSceneScript(PKG_NAME, 'health-detect', {}, callback);
    },

    refreshHealth() {
        this.detectHealth((err, res) => {
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
                    Editor.Scene.callSceneScript(PKG_NAME, 'cleanup-orphans', {}, (_err, _res) => {
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
        'list-controllers'(event) {
            this.listControllers((err, graph) => {
                if (!err && graph) {
                    this.currentGraph = graph;
                    this.renderDashboard();
                    this.renderConfigDropdown();
                    this.renderConfigWorkspace();
                }
                reply(event, err, graph || null);
            });
        },

        'health-detect'(event) {
            this.detectHealth((err, res) => {
                if (!err && res) {
                    this.renderHealth(res.issues || []);
                }
                else {
                    this.fallbackHealthDetect();
                }
                reply(event, err, res || null);
            });
        },

        'res-list-controllers'(event, graph) {
            this.currentGraph = graph;
            this.renderDashboard();
            this.renderConfigDropdown();
            this.renderConfigWorkspace();
        },
    },
});
