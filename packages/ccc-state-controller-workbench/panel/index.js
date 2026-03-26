'use strict';

const ICONS = {
  layers: '<svg class="icon" viewBox="0 0 16 16"><path d="M8 1.25 1.5 4.5 8 7.75l6.5-3.25L8 1.25Zm-6.5 6L8 10.5l6.5-3.25v2L8 12.5l-6.5-3.25v-2Zm0 4L8 14.5l6.5-3.25" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>',
  install: '<svg class="icon" viewBox="0 0 16 16"><path d="M8 1.75v7.5m0 0 2.5-2.5M8 9.25l-2.5-2.5M2.25 11.5h11.5v2.25H2.25z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  refresh: '<svg class="icon" viewBox="0 0 16 16"><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.39 0 2.66.52 3.63 1.37M13.5 2.5v3.75H9.75" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  locate: '<svg class="icon" viewBox="0 0 16 16"><path d="M8 1.5v2.25M8 12.25v2.25M1.5 8h2.25M12.25 8h2.25M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warning: '<svg class="icon" viewBox="0 0 16 16"><path d="M8 2.25 14 13.5H2L8 2.25Zm0 3.5v3m0 2h.01" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

Editor.Panel.extend({
  style: `
    :host {
      --primary: #22C55E;
      --primary-soft: rgba(34, 197, 94, 0.14);
      --bg: #0F172A;
      --bg-soft: #111C31;
      --panel: #172338;
      --panel-strong: #1E293B;
      --panel-muted: #243247;
      --border: #314156;
      --border-strong: #41536A;
      --text: #F8FAFC;
      --text-soft: #B8C4D8;
      --text-muted: #7E8CA3;
      --danger: #F45B6B;
      --warning: #E8B83D;
      --info: #5CC4FF;
      --radius: 12px;
      --radius-sm: 8px;
      --shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
      background: radial-gradient(circle at top, #16233A 0%, var(--bg) 56%);
      color: var(--text);
      font-family: "Segoe UI", "Fira Sans", sans-serif;
      font-size: 12px;
      display: flex;
      min-height: 100%;
    }

    * {
      box-sizing: border-box;
    }

    .icon {
      width: 14px;
      height: 14px;
      display: inline-block;
      flex-shrink: 0;
    }

    .shell {
      display: flex;
      flex-direction: column;
      width: 100%;
      padding: 16px;
      gap: 14px;
    }

    .hero {
      display: grid;
      grid-template-columns: 1.2fr auto;
      gap: 14px;
      padding: 18px;
      border: 1px solid rgba(92, 196, 255, 0.2);
      background:
        linear-gradient(135deg, rgba(34, 197, 94, 0.14), rgba(92, 196, 255, 0.08)),
        rgba(23, 35, 56, 0.86);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      align-items: end;
    }

    .hero h1 {
      margin: 0 0 6px;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .hero p {
      margin: 0;
      color: var(--text-soft);
      line-height: 1.45;
      max-width: 640px;
    }

    .tab-row {
      display: flex;
      gap: 8px;
      align-self: start;
    }

    .tab-btn,
    ui-button.action-btn {
      cursor: pointer;
    }

    .tab-btn {
      border: 1px solid var(--border);
      background: rgba(15, 23, 42, 0.7);
      color: var(--text-soft);
      padding: 10px 12px;
      border-radius: 999px;
      min-width: 152px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: 180ms ease;
    }

    .tab-btn.active {
      color: var(--text);
      border-color: rgba(34, 197, 94, 0.45);
      background: rgba(34, 197, 94, 0.16);
      box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.12);
    }

    .page {
      display: none;
      min-height: 0;
    }

    .page.active {
      display: block;
      flex: 1;
    }

    .install-page,
    .visual-page {
      min-height: 0;
    }

    .install-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .card,
    .panel-card {
      background: rgba(23, 35, 56, 0.9);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    .card {
      padding: 16px;
    }

    .card-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
      font-size: 13px;
      color: var(--text);
      font-weight: 700;
    }

    .field {
      display: grid;
      gap: 6px;
      margin-bottom: 12px;
    }

    .field label {
      color: var(--text-soft);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .field-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
    }

    ui-input.path-input {
      width: 100%;
      padding: 8px 10px;
      background: var(--panel-strong);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text);
    }

    .status-block {
      display: grid;
      gap: 10px;
    }

    .status-line {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: rgba(17, 28, 49, 0.82);
      border: 1px solid rgba(65, 83, 106, 0.55);
    }

    .status-line strong {
      color: var(--text);
      font-weight: 600;
    }

    .status-line span {
      color: var(--text-soft);
      text-align: right;
      word-break: break-all;
    }

    .button-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    ui-button.action-btn {
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--panel-strong);
      color: var(--text);
      transition: 180ms ease;
    }

    ui-button.action-btn.primary {
      background: var(--primary);
      border-color: transparent;
      color: #08110A;
      font-weight: 700;
    }

    ui-button.action-btn:hover,
    .controller-item:hover,
    .state-chip:hover,
    .select-row:hover {
      border-color: var(--border-strong);
      background: var(--panel-muted);
    }

    ui-button.action-btn.primary:hover {
      background: #2DD567;
    }

    .note {
      margin-top: 8px;
      color: var(--text-muted);
      line-height: 1.45;
    }

    .visual-layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 14px;
      min-height: 520px;
    }

    .side-panel,
    .detail-panel {
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .panel-head {
      padding: 14px 16px 10px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      border-bottom: 1px solid rgba(65, 83, 106, 0.4);
    }

    .panel-head h2 {
      margin: 0;
      font-size: 13px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-soft);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }

    .summary-card {
      padding: 14px 16px;
      background: rgba(23, 35, 56, 0.92);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }

    .summary-card strong {
      display: block;
      font-size: 24px;
      margin-top: 4px;
      font-family: "Fira Code", Consolas, monospace;
    }

    .summary-card span {
      color: var(--text-soft);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 10px;
    }

    .controller-list,
    .detail-scroll {
      overflow: auto;
      min-height: 0;
      padding: 10px;
      display: grid;
      gap: 8px;
    }

    .controller-item {
      padding: 12px;
      border-radius: 10px;
      border: 1px solid rgba(65, 83, 106, 0.55);
      background: rgba(17, 28, 49, 0.9);
      transition: 180ms ease;
      cursor: pointer;
    }

    .controller-item.active {
      border-color: rgba(34, 197, 94, 0.55);
      background: rgba(34, 197, 94, 0.12);
    }

    .controller-title {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      margin-bottom: 6px;
    }

    .controller-title strong {
      font-size: 13px;
    }

    .controller-meta,
    .detail-sub,
    .empty {
      color: var(--text-muted);
      line-height: 1.45;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(92, 196, 255, 0.1);
      border: 1px solid rgba(92, 196, 255, 0.22);
      color: var(--info);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .badge.warn {
      color: var(--warning);
      background: rgba(232, 184, 61, 0.1);
      border-color: rgba(232, 184, 61, 0.22);
    }

    .detail-body {
      display: grid;
      gap: 14px;
    }

    .scene-alerts {
      display: grid;
      gap: 10px;
    }

    .alert-card {
      padding: 14px 16px;
      border-radius: var(--radius);
      border: 1px solid rgba(232, 184, 61, 0.28);
      background: rgba(232, 184, 61, 0.08);
    }

    .alert-card strong {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      color: var(--warning);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .alert-card ul {
      margin: 0;
      padding-left: 18px;
      color: var(--text-soft);
      line-height: 1.5;
    }

    .detail-hero {
      padding: 16px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background: linear-gradient(135deg, rgba(92, 196, 255, 0.12), rgba(34, 197, 94, 0.08));
    }

    .detail-hero h3 {
      margin: 0 0 4px;
      font-size: 20px;
    }

    .detail-meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .mini-card {
      padding: 12px;
      border-radius: 10px;
      background: rgba(17, 28, 49, 0.9);
      border: 1px solid rgba(65, 83, 106, 0.55);
    }

    .mini-card span {
      color: var(--text-muted);
      display: block;
      margin-bottom: 4px;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.08em;
    }

    .state-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .state-chip {
      min-width: 112px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(65, 83, 106, 0.55);
      background: rgba(17, 28, 49, 0.9);
      color: var(--text);
      text-align: left;
      transition: 180ms ease;
      cursor: pointer;
    }

    .state-chip.active {
      border-color: rgba(34, 197, 94, 0.55);
      background: rgba(34, 197, 94, 0.16);
    }

    .state-chip small,
    .select-row small {
      display: block;
      margin-top: 4px;
      color: var(--text-muted);
      font-size: 10px;
    }

    .select-table {
      display: grid;
      gap: 8px;
    }

    .select-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid rgba(65, 83, 106, 0.55);
      background: rgba(17, 28, 49, 0.9);
      transition: 180ms ease;
    }

    .row-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .anomaly-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .anomaly-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(232, 184, 61, 0.32);
      background: rgba(232, 184, 61, 0.12);
      color: var(--warning);
      font-size: 11px;
    }
  `,

  template: `
    <div class="shell">
      <section class="hero">
        <div>
          <h1>State Controller Workbench</h1>
          <p>Install the runtime from the current project source and inspect all active StateController / StateSelect bindings in one place.</p>
        </div>
        <div class="tab-row">
          <ui-button id="tab-visual" class="tab-btn active">${ICONS.layers}<span>Visualizer</span></ui-button>
          <ui-button id="tab-install" class="tab-btn">${ICONS.install}<span>Runtime Install</span></ui-button>
        </div>
      </section>

      <section id="page-visual" class="page visual-page active">
        <div id="summary-grid" class="summary-grid"></div>
        <div class="visual-layout">
          <div class="panel-card side-panel">
            <div class="panel-head">
              <h2>Controllers</h2>
              <ui-button id="refresh-visual" class="action-btn">${ICONS.refresh}<span>Refresh</span></ui-button>
            </div>
            <div id="controller-list" class="controller-list"></div>
          </div>

          <div class="panel-card detail-panel">
            <div class="panel-head">
              <h2>Controller Detail</h2>
              <div id="detail-status" class="detail-sub">Select a controller to inspect states and bindings.</div>
            </div>
            <div id="detail-scroll" class="detail-scroll"></div>
          </div>
        </div>
      </section>

      <section id="page-install" class="page install-page">
        <div class="install-grid">
          <div class="card">
            <div class="card-title">${ICONS.install}<span>Runtime Installation</span></div>
            <div class="field">
              <label>Source Runtime</label>
              <ui-input id="source-dir" class="path-input" readonly></ui-input>
            </div>
            <div class="field">
              <label>Target Directory</label>
              <div class="field-row">
                <ui-input id="target-dir" class="path-input" readonly></ui-input>
                <ui-button id="browse-target" class="action-btn">Browse</ui-button>
              </div>
            </div>
            <div class="button-row">
              <ui-button id="refresh-install" class="action-btn">${ICONS.refresh}<span>Status</span></ui-button>
              <ui-button id="install-runtime" class="action-btn primary">${ICONS.install}<span>Install</span></ui-button>
              <ui-button id="force-install" class="action-btn">Overwrite</ui-button>
            </div>
            <div class="note" id="install-message">The current project runtime in <code>assets/script/Controller</code> is used as the install source.</div>
          </div>

          <div class="card">
            <div class="card-title">${ICONS.layers}<span>Status Snapshot</span></div>
            <div id="runtime-status" class="status-block"></div>
          </div>
        </div>
      </section>
    </div>
  `,

  $: {
    tabVisual: '#tab-visual',
    tabInstall: '#tab-install',
    pageVisual: '#page-visual',
    pageInstall: '#page-install',
    summaryGrid: '#summary-grid',
    refreshVisual: '#refresh-visual',
    controllerList: '#controller-list',
    detailStatus: '#detail-status',
    detailScroll: '#detail-scroll',
    sourceDir: '#source-dir',
    targetDir: '#target-dir',
    browseTarget: '#browse-target',
    refreshInstall: '#refresh-install',
    installRuntime: '#install-runtime',
    forceInstall: '#force-install',
    runtimeStatus: '#runtime-status',
    installMessage: '#install-message',
  },

  ready() {
    this._state = {
      activeTab: 'visual',
      sourceDir: '',
      targetDir: '',
      graph: null,
      selectedControllerId: null,
    };

    this._bindEvents();
    this._initialize();
  },

  _bindEvents() {
    this.$tabVisual.addEventListener('confirm', () => this._switchTab('visual'));
    this.$tabInstall.addEventListener('confirm', () => this._switchTab('install'));
    this.$refreshVisual.addEventListener('confirm', () => this._refreshVisualization());
    this.$refreshInstall.addEventListener('confirm', () => this._refreshInstallStatus());
    this.$browseTarget.addEventListener('confirm', () => this._browseTargetDir());
    this.$installRuntime.addEventListener('confirm', () => this._installRuntime(false));
    this.$forceInstall.addEventListener('confirm', () => this._installRuntime(true));
  },

  _initialize() {
    Editor.Ipc.sendToMain('ccc-state-controller-workbench:init-panel', (error, result) => {
      if (error || !result) {
        this._setInstallMessage(error ? error.message : 'Failed to initialize panel.');
        return;
      }

      this._state.sourceDir = result.sourceDir || '';
      this._state.targetDir = result.targetDir || '';
      this.setAttribute('data-theme', result.theme || 'slate-green');

      this.$sourceDir.value = this._state.sourceDir;
      this.$targetDir.value = this._state.targetDir;

      this._refreshInstallStatus();
      this._refreshVisualization();
    });
  },

  _switchTab(tab) {
    this._state.activeTab = tab;
    const isVisual = tab === 'visual';
    this.$tabVisual.classList.toggle('active', isVisual);
    this.$tabInstall.classList.toggle('active', !isVisual);
    this.$pageVisual.classList.toggle('active', isVisual);
    this.$pageInstall.classList.toggle('active', !isVisual);
  },

  _browseTargetDir() {
    Editor.Ipc.sendToMain('ccc-state-controller-workbench:select-target-directory', (error, result) => {
      if (error) {
        this._setInstallMessage(error.message);
        return;
      }

      if (!result || !result.path) {
        return;
      }

      this._state.targetDir = result.path;
      this.$targetDir.value = result.path;
      this._refreshInstallStatus();
    });
  },

  _refreshInstallStatus() {
    Editor.Ipc.sendToMain('ccc-state-controller-workbench:get-runtime-status', {
      sourceDir: this._state.sourceDir,
      targetDir: this._state.targetDir,
    }, (error, status) => {
      if (error || !status) {
        this._setInstallMessage(error ? error.message : 'Failed to read runtime status.');
        return;
      }

      this._renderRuntimeStatus(status);
    });
  },

  _installRuntime(overwrite) {
    Editor.Ipc.sendToMain('ccc-state-controller-workbench:install-runtime', {
      sourceDir: this._state.sourceDir,
      targetDir: this._state.targetDir,
      overwrite,
    }, (error, result) => {
      if (error || !result) {
        this._setInstallMessage(error ? error.message : 'Runtime install failed.');
        return;
      }

      this._setInstallMessage(result.message || (result.success ? 'Runtime installed.' : result.error));
      this._renderRuntimeStatus(result.status || null);
    });
  },

  _refreshVisualization() {
    Editor.Scene.callSceneScript('ccc-state-controller-workbench', 'scan-controllers', {}, (error, result) => {
      if (error || !result) {
        this.$summaryGrid.innerHTML = '';
        this.$controllerList.innerHTML = '<div class="empty">Failed to scan scene controllers.</div>';
        this.$detailScroll.innerHTML = '<div class="empty">Scene scan failed.</div>';
        return;
      }

      this._state.graph = result;

      if (!result.controllers.length) {
        this._state.selectedControllerId = null;
      } else if (!result.controllers.some((controller) => controller.ctrlId === this._state.selectedControllerId)) {
        this._state.selectedControllerId = result.controllers[0].ctrlId;
      }

      this._renderSummary(result.summary);
      this._renderControllerList(result.controllers);
      this._renderControllerDetail();
    });
  },

  _renderSummary(summary) {
    const cards = [
      ['Controllers', summary.controllerCount],
      ['StateSelects', summary.selectCount],
      ['Controllers With Issues', summary.controllersWithIssues],
      ['Orphans', summary.orphanSelectCount],
      ['Controlled Props', summary.totalControlledProps],
    ];

    this.$summaryGrid.innerHTML = cards.map(([label, value]) => `
      <div class="summary-card">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join('');
  },

  _renderControllerList(controllers) {
    if (!controllers.length) {
      this.$controllerList.innerHTML = '<div class="empty">No StateController found in the active scene.</div>';
      return;
    }

    this.$controllerList.innerHTML = controllers.map((controller) => `
      <div class="controller-item ${controller.ctrlId === this._state.selectedControllerId ? 'active' : ''}" data-controller-id="${controller.ctrlId}">
        <div class="controller-title">
          <strong>${controller.ctrlName || controller.nodeName}</strong>
          ${controller.anomalies.length ? `<span class="badge warn">${ICONS.warning}<span>${controller.anomalies.length} issue</span></span>` : `<span class="badge">${controller.states.length} states</span>`}
        </div>
        <div class="controller-meta">${controller.nodePath}</div>
        <div class="controller-meta">Selected: ${controller.selectedPage || 'None'} · Bound Selects: ${controller.boundSelectCount}</div>
      </div>
    `).join('');

    Array.from(this.$controllerList.querySelectorAll('.controller-item')).forEach((node) => {
      node.addEventListener('click', () => {
        this._state.selectedControllerId = Number(node.getAttribute('data-controller-id'));
        this._renderControllerList(controllers);
        this._renderControllerDetail();
      });
    });
  },

  _renderControllerDetail() {
    const graph = this._state.graph;
    if (!graph || !graph.controllers.length) {
      this.$detailStatus.textContent = 'No controller selected.';
      this.$detailScroll.innerHTML = '<div class="empty">Nothing to inspect yet.</div>';
      return;
    }

    const controller = graph.controllers.find((item) => item.ctrlId === this._state.selectedControllerId);
    if (!controller) {
      this.$detailStatus.textContent = 'Controller selection is stale.';
      this.$detailScroll.innerHTML = '<div class="empty">Pick another controller from the left list.</div>';
      return;
    }

    this.$detailStatus.textContent = `${controller.nodePath}`;

    const sceneAlerts = this._renderSceneAlerts(graph);
    const anomalyHtml = controller.anomalies.length
      ? `<div class="anomaly-list">${controller.anomalies.map((item) => `<span class="anomaly-pill">${ICONS.warning}<span>${item}</span></span>`).join('')}</div>`
      : '<div class="detail-sub">No controller-level anomaly detected.</div>';

    const selectRows = controller.linkedSelects.length
      ? controller.linkedSelects.map((select) => `
        <div class="select-row">
          <div>
            <strong>${select.nodeName}</strong>
            <small>${select.nodePath}</small>
            <small>State: ${select.ctrlState} · Controlled props: ${select.controlledPropsCount}</small>
          </div>
          <div class="row-actions">
            ${select.anomalies.length ? `<span class="badge warn">${select.anomalies.length} issue</span>` : ''}
            <ui-button class="action-btn select-node-btn" data-node-uuid="${select.nodeUuid}">${ICONS.locate}<span>Select</span></ui-button>
          </div>
        </div>
      `).join('')
      : '<div class="empty">No StateSelect currently bound to this controller.</div>';

    const stateChips = controller.states.length
      ? controller.states.map((state) => `
        <button class="state-chip ${state.index === controller.selectedIndex ? 'active' : ''}" data-controller-id="${controller.ctrlId}" data-state-index="${state.index}">
          <strong>${state.name}</strong>
          <small>index ${state.index} · id ${state.stateId}</small>
        </button>
      `).join('')
      : '<div class="empty">This controller currently has no states.</div>';

    this.$detailScroll.innerHTML = `
      <div class="detail-body">
        ${sceneAlerts}
        <div class="detail-hero">
          <h3>${controller.ctrlName || controller.nodeName}</h3>
          <div class="detail-sub">${controller.nodePath}</div>
          <div class="button-row">
            <ui-button class="action-btn select-node-btn" data-node-uuid="${controller.nodeUuid}">${ICONS.locate}<span>Select Node</span></ui-button>
            <ui-button class="action-btn" id="refresh-detail">${ICONS.refresh}<span>Rescan</span></ui-button>
          </div>
        </div>

        <div class="detail-meta-grid">
          <div class="mini-card"><span>Controller ID</span><strong>${controller.ctrlId}</strong></div>
          <div class="mini-card"><span>Selected State</span><strong>${controller.selectedPage || 'None'}</strong></div>
          <div class="mini-card"><span>Bound Selects</span><strong>${controller.boundSelectCount}</strong></div>
          <div class="mini-card"><span>Controlled Props</span><strong>${controller.controlledPropsTotal}</strong></div>
        </div>

        <div>
          <div class="card-title">${ICONS.warning}<span>Anomalies</span></div>
          ${anomalyHtml}
        </div>

        <div>
          <div class="card-title">${ICONS.layers}<span>States</span></div>
          <div class="state-grid">${stateChips}</div>
        </div>

        <div>
          <div class="card-title">${ICONS.layers}<span>Linked StateSelect Nodes</span></div>
          <div class="select-table">${selectRows}</div>
        </div>
      </div>
    `;

    const refreshDetail = this.$detailScroll.querySelector('#refresh-detail');
    if (refreshDetail) {
      refreshDetail.addEventListener('confirm', () => this._refreshVisualization());
    }

    Array.from(this.$detailScroll.querySelectorAll('.select-node-btn')).forEach((button) => {
      button.addEventListener('confirm', () => {
        this._selectNode(button.getAttribute('data-node-uuid'));
      });
    });

    Array.from(this.$detailScroll.querySelectorAll('.state-chip')).forEach((button) => {
      button.addEventListener('click', () => {
        this._setControllerState(
          Number(button.getAttribute('data-controller-id')),
          Number(button.getAttribute('data-state-index')),
        );
      });
    });
  },

  _selectNode(nodeUuid) {
    Editor.Scene.callSceneScript('ccc-state-controller-workbench', 'select-node', nodeUuid, () => {});
  },

  _renderSceneAlerts(graph) {
    const alerts = [];

    if (graph.summary.controllersWithIssues > 0) {
      const issueControllers = graph.controllers
        .filter((controller) => controller.anomalies.length > 0)
        .map((controller) => `<li>${controller.ctrlName || controller.nodeName}: ${controller.anomalies.join(', ')}</li>`)
        .join('');

      alerts.push(`
        <div class="alert-card">
          <strong>${ICONS.warning}<span>Controller Issues</span></strong>
          <ul>${issueControllers}</ul>
        </div>
      `);
    }

    if (graph.orphanSelects.length > 0) {
      const orphanRows = graph.orphanSelects
        .map((select) => `<li>${select.nodeName}: ${select.nodePath}</li>`)
        .join('');

      alerts.push(`
        <div class="alert-card">
          <strong>${ICONS.warning}<span>Unbound StateSelect</span></strong>
          <ul>${orphanRows}</ul>
        </div>
      `);
    }

    if (!alerts.length) {
      return '';
    }

    return `<div class="scene-alerts">${alerts.join('')}</div>`;
  },

  _setControllerState(ctrlId, stateIndex) {
    Editor.Scene.callSceneScript('ccc-state-controller-workbench', 'set-controller-state', {
      ctrlId,
      stateIndex,
    }, (error, result) => {
      if (error || !result) {
        return;
      }

      this._state.graph = result;
      this._renderSummary(result.summary);
      this._renderControllerList(result.controllers);
      this._renderControllerDetail();
    });
  },

  _renderRuntimeStatus(status) {
    if (!status) {
      this.$runtimeStatus.innerHTML = '<div class="empty">Runtime status unavailable.</div>';
      return;
    }

    const rows = [
      ['Source Exists', status.sourceExists ? 'Yes' : 'No'],
      ['Source Files', String(status.sourceFileCount)],
      ['Target Installed', status.target && status.target.installed ? 'Yes' : 'No'],
      ['Missing Core Files', status.target && status.target.missingFiles.length ? status.target.missingFiles.join(', ') : 'None'],
      ['Same As Source', status.sameAsSource ? 'Yes' : 'No'],
      ['Target Directory', status.targetDir],
    ];

    this.$runtimeStatus.innerHTML = rows.map(([label, value]) => `
      <div class="status-line">
        <strong>${label}</strong>
        <span>${value}</span>
      </div>
    `).join('');
  },

  _setInstallMessage(message) {
    this.$installMessage.textContent = message || '';
  },

  messages: {
    'selection:selected'(_event, type) {
      if (type === 'node') {
        this._refreshVisualization();
      }
    },

    'selection:unselected'(_event, type) {
      if (type === 'node') {
        this._refreshVisualization();
      }
    }
  }
});
