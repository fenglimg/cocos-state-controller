'use strict';

const SNAP_INDEX_KEY = 'sel' + 'ectedIndex';
const NODE_UUID_KEY = 'sel' + 'ectUuid';
const SET_INDEX_MSG = 'set-' + 'sel' + 'ected-index';

const KNOWN_PROPS = [
    { name: 'position', propType: 'cc.Node.position' },
    { name: 'active', propType: 'cc.Node.active' },
    { name: 'scale', propType: 'cc.Node.scale' },
    { name: 'opacity', propType: 'cc.Node.opacity' },
    { name: 'color', propType: 'cc.Node.color' },
    { name: 'spriteFrame', propType: 'cc.Sprite.spriteFrame' },
];

const ANOMALY = { loose: 1, excluded: 1, mixed: 1 };

module.exports = {
    $: {
        // 顶部
        tabOverview: '#tab-overview',
        tabEditor: '#tab-editor',
        overviewActions: '#overview-actions',
        editorActions: '#editor-actions',
        viewOverview: '#view-overview',
        viewEditor: '#view-editor',
        filterLevel: '#filter-level',
        searchInput: '#search-input',
        // 观测总览
        dashboardGrid: '#dashboard-grid',
        topologyTree: '#topology-tree',
        matrixTitle: '#matrix-title',
        valueMatrix: '#value-matrix',
        matrixHead: '#matrix-head',
        matrixBody: '#matrix-body',
        matrixEmpty: '#matrix-empty',
        issuesCount: '#issues-count',
        issuesList: '#issues-list',
        overviewEmpty: '#overview-empty',
        // inspector flags
        chkInspectorMaster: '#chk-inspector-master',
        chkInspectorViz: '#chk-inspector-viz',
        chkInspectorDirty: '#chk-inspector-dirty',
        chkInspectorExclude: '#chk-inspector-exclude',
        inspectorSubToggles: '#inspector-sub-toggles',
        // 编辑视图
        statesList: '#states-list',
        btnAddState: '#btn-add-state',
        stateDetail: '#state-detail',
        emptyTip: '#empty-tip',
        ctrlList: '#ctrl-list',
        btnPrevCtrl: '#btn-prev-ctrl',
        btnCtrlSwitch: '#btn-ctrl-switch',
        btnNextCtrl: '#btn-next-ctrl',
        btnStatePick: '#btn-state-pick',
        stateTitle: '#state-title',
        recordBadge: '#record-badge',
        btnStartRecord: '#btn-start-record',
        btnStopRecord: '#btn-stop-record',
        btnCancelRecord: '#btn-cancel-record',
        btnFollowedToggle: '#btn-followed-toggle',
        btnReadyToggle: '#btn-ready-toggle',
        followedCount: '#followed-count',
        readyCount: '#ready-count',
        followedProps: '#followed-props',
        readyProps: '#ready-props',
        // 模板
        tplStateItem: '#tpl-state-item',
        tplPropItem: '#tpl-prop-item',
        tplCtrlItem: '#tpl-ctrl-item',
        tplDashboardCard: '#tpl-dashboard-card',
        tplTreeCtrl: '#tpl-tree-ctrl',
        tplTreeNode: '#tpl-tree-node',
        tplTreeProp: '#tpl-tree-prop',
        tplMatrixTh: '#tpl-matrix-th',
        tplMatrixRow: '#tpl-matrix-row',
        tplMatrixCell: '#tpl-matrix-cell',
        tplIssueItem: '#tpl-issue-item',
    },

    ready() {
        // 编辑视图状态
        this.currentCtrlUuid = null;
        this.currentSnapshot = null;
        this.ctrlItems = [];
        this.folded = { followed: false, ready: false };
        this._initialFetch = true;
        // 观测视图状态
        this.activeView = 'overview';
        this.topology = null;
        this.collapsedCtrls = {};            // ctrlId → true (折叠)
        this.selMemberUuid = null;           // 当前矩阵展示的成员节点 uuid
        this.matrixCtrl = null;              // 当前矩阵关联的 controller (含 states/selectedIndex)

        this._fetchInspectorFlags();
        this._bindEvents();
        this._initialRefresh();
    },

    close() {
        if (this._onEditorSelected) {
            try { Editor.Selection.removeListener('selected', this._onEditorSelected); } catch (e) { /* 静默 */ }
            this._onEditorSelected = null;
        }
        this._callScene('dispose-all-bridges');
    },

    _callScene(method, payload, cb) {
        Editor.Scene.callSceneScript('state-controller-panel', method, payload || null, cb || function () {});
    },

    // 初次拉取: 纯事件驱动, 先问场景是否就绪 (避免 scene-script 未注册时盲调告警).
    _initialRefresh() {
        Editor.Ipc.sendToMain('state-controller-panel:is-scene-ready', (err, ready) => {
            if (!err && ready) {
                this.refreshTopology();
                this.refreshCtrlList();
            }
        });
    },

    // ============================================================
    // 事件绑定
    // ============================================================
    _bindEvents() {
        // --- tab 切换 ---
        this.$tabOverview.addEventListener('click', () => this.switchView('overview'));
        this.$tabEditor.addEventListener('click', () => this.switchView('editor'));

        // --- 观测过滤 / 搜索 ---
        this.$filterLevel.addEventListener('change', () => this.renderTopology());
        this.$searchInput.addEventListener('input', () => this.renderTopology());

        // --- 反向高亮: 编辑器选中节点 → 总览定位 (存 handler, close 时解绑防泄漏) ---
        this._onEditorSelected = (type, ids) => {
            if (type === 'node' && ids && ids.length > 0) this._reverseHighlight(ids[0]);
        };
        try { Editor.Selection.on('selected', this._onEditorSelected); } catch (e) { /* 静默 */ }

        // --- 编辑视图事件 ---
        this.$btnAddState.addEventListener('click', () => {
            if (!this.currentCtrlUuid || !this.currentSnapshot || this.currentSnapshot.isRecording) return;
            const states = this.currentSnapshot.states || [];
            this._callScene('add-state', { uuid: this.currentCtrlUuid, name: `State_${states.length + 1}` }, (err) => {
                if (err) Editor.warn(err);
                this.refreshSnapshot();
            });
        });
        this.$btnPrevCtrl.addEventListener('click', () => this._stepCtrl(-1));
        this.$btnCtrlSwitch.addEventListener('click', () => this._stepCtrl(1));
        this.$btnNextCtrl.addEventListener('click', () => this._stepCtrl(1));
        this.$btnStatePick.addEventListener('click', () => this._stepState());
        this.$btnStartRecord.addEventListener('click', () => this._setRecording(true));
        this.$btnStopRecord.addEventListener('click', () => this._setRecording(false));
        this.$btnCancelRecord.addEventListener('click', () => {
            if (!this.currentCtrlUuid) return;
            this._callScene('cancel-recording', { uuid: this.currentCtrlUuid }, (err) => {
                if (err) Editor.warn(err);
                this.refreshSnapshot();
            });
        });
        this.$btnFollowedToggle.addEventListener('click', () => { this.folded.followed = !this.folded.followed; this.renderProps(); });
        this.$btnReadyToggle.addEventListener('click', () => { this.folded.ready = !this.folded.ready; this.renderProps(); });

        this.$chkInspectorMaster.addEventListener('change', () => {
            this._updateInspectorSubToggles();
            if (this.$chkInspectorMaster.checked) Editor.Ipc.sendToMain('state-controller-panel:inspector-mark-on');
            else Editor.Ipc.sendToMain('state-controller-panel:inspector-mark-off');
        });
        const onSubFlagChange = () => { if (this.$chkInspectorMaster.checked) this._syncInspectorSubFlags(); };
        this.$chkInspectorViz.addEventListener('change', onSubFlagChange);
        this.$chkInspectorDirty.addEventListener('change', onSubFlagChange);
        this.$chkInspectorExclude.addEventListener('change', onSubFlagChange);
    },

    switchView(view) {
        this.activeView = view;
        const ov = view === 'overview';
        this.$tabOverview.classList.toggle('is-active', ov);
        this.$tabEditor.classList.toggle('is-active', !ov);
        this.$overviewActions.style.display = ov ? 'flex' : 'none';
        this.$editorActions.style.display = ov ? 'none' : 'flex';
        this.$viewOverview.style.display = ov ? 'flex' : 'none';
        this.$viewEditor.style.display = ov ? 'none' : 'flex';
        if (ov) this.refreshTopology();
        else this.refreshCtrlList();
    },

    // ============================================================
    // 观测总览
    // ============================================================
    refreshTopology() {
        if (this.activeView !== 'overview') return;
        this._callScene('list-scene-topology', null, (err, topology) => {
            if (err) { if (!this._initialFetch) Editor.warn(err); return; }
            this.topology = topology || { controllers: [] };
            this.renderTopology();
        });
    },

    _filterLevel() { return (this.$filterLevel && this.$filterLevel.value) || 'default'; },
    _keyword() { return (this.$searchInput.value || '').toLowerCase().trim(); },

    _propPassesLevel(prop, level) {
        if (level === 'all') return true;
        const anomaly = !!ANOMALY[prop.kind];
        if (level === 'abnormal') return anomaly;
        return anomaly || !!prop.variesAcrossStates;   // default: 变化 OR 异常
    },
    _propMatchesKeyword(prop, kw, ctrlName, nodeName) {
        if (!kw) return true;
        return (prop.display || '').toLowerCase().indexOf(kw) >= 0
            || (prop.compName || '').toLowerCase().indexOf(kw) >= 0
            || (ctrlName || '').toLowerCase().indexOf(kw) >= 0
            || (nodeName || '').toLowerCase().indexOf(kw) >= 0;
    },
    _visibleProps(member, ctrl) {
        const level = this._filterLevel(), kw = this._keyword();
        return (member.props || []).filter(p =>
            this._propPassesLevel(p, level) && this._propMatchesKeyword(p, kw, ctrl.ctrlName, member.nodeName));
    },

    renderTopology() {
        const ctrls = (this.topology && this.topology.controllers) || [];
        this.$topologyTree.innerHTML = '';
        if (!ctrls.length) {
            this.$overviewEmpty.style.display = 'flex';
            this.renderDashboard(); this.renderIssues();
            return;
        }
        this.$overviewEmpty.style.display = 'none';

        ctrls.forEach(ctrl => {
            const collapsed = !!this.collapsedCtrls[ctrl.ctrlId];
            const ctrlNode = document.importNode(this.$tplTreeCtrl.content, true);
            const ctrlEl = ctrlNode.querySelector('.tree-ctrl');
            ctrlEl.classList.toggle('collapsed', collapsed);
            ctrlNode.querySelector('.tree-ctrl-name').textContent = ctrl.ctrlName || `Controller ${ctrl.ctrlId}`;
            ctrlEl.addEventListener('click', () => {
                this.collapsedCtrls[ctrl.ctrlId] = !this.collapsedCtrls[ctrl.ctrlId];
                this.renderTopology();
            });
            this.$topologyTree.appendChild(ctrlNode);
            if (collapsed) return;

            (ctrl.members || []).forEach(member => {
                const visProps = this._visibleProps(member, ctrl);
                if (!visProps.length && this._keyword()) return;   // 搜索时空成员不显示

                const nodeFrag = document.importNode(this.$tplTreeNode.content, true);
                const nodeEl = nodeFrag.querySelector('.tree-node');
                nodeEl.querySelector('.tree-node-name').textContent = member.nodeName || '(node)';
                nodeEl.title = member.nodePath || '';
                nodeEl.dataset.nodeUuid = member.nodeUuid;
                nodeEl.dataset.ctrlId = ctrl.ctrlId;
                if (member.nodeUuid === this.selMemberUuid) nodeEl.classList.add('is-selected');
                nodeEl.addEventListener('click', () => this._selectMember(ctrl, member));
                this.$topologyTree.appendChild(nodeFrag);

                visProps.forEach(prop => {
                    const propFrag = document.importNode(this.$tplTreeProp.content, true);
                    const propEl = propFrag.querySelector('.tree-prop');
                    propEl.querySelector('.tree-prop-name').textContent = `↳ ${prop.display}`;
                    propEl.title = `${prop.compName} · ${prop.propRef}`;
                    const badge = propEl.querySelector('.kind-badge');
                    badge.textContent = prop.kind;
                    badge.classList.add(prop.kind);
                    propEl.addEventListener('click', () => this._selectMember(ctrl, member, prop.propRef));
                    this.$topologyTree.appendChild(propFrag);
                });
            });
        });

        this.renderDashboard();
        this.renderIssues();
        // 重渲后若已有选中成员, 同步矩阵 (状态/值可能变了)
        if (this.selMemberUuid) {
            const found = this._findMember(this.selMemberUuid);
            if (found) this.renderMatrix(found.ctrl, found.member);
            else this._clearMatrix();
        } else {
            this._clearMatrix();
        }
    },

    renderDashboard() {
        const ctrls = (this.topology && this.topology.controllers) || [];
        this.$dashboardGrid.innerHTML = '';
        ctrls.forEach(ctrl => {
            const frag = document.importNode(this.$tplDashboardCard.content, true);
            const card = frag.querySelector('.db-card');
            const cur = (ctrl.states || []).find(s => s.index === ctrl.selectedIndex);
            frag.querySelector('.db-title').textContent = ctrl.ctrlName || `Controller ${ctrl.ctrlId}`;
            frag.querySelector('.db-state-name').textContent = cur ? (cur.name || `#${cur.index + 1}`) : '--';
            const dot = frag.querySelector('.status-dot');
            if (ctrl.isRecording) dot.classList.add('recording');
            if (this.matrixCtrl && this.matrixCtrl.uuid === ctrl.uuid) card.classList.add('active');
            card.addEventListener('click', () => {
                const m = (ctrl.members || [])[0];
                if (m) this._selectMember(ctrl, m);
            });
            this.$dashboardGrid.appendChild(frag);
        });
    },

    renderIssues() {
        const ctrls = (this.topology && this.topology.controllers) || [];
        const issues = [];
        ctrls.forEach(ctrl => (ctrl.members || []).forEach(member => (member.props || []).forEach(prop => {
            if (ANOMALY[prop.kind]) issues.push({ ctrl, member, prop });
        })));
        this.$issuesCount.textContent = String(issues.length);
        this.$issuesList.innerHTML = '';
        if (!issues.length) {
            const e = document.createElement('div');
            e.className = 'issue-empty';
            e.textContent = '没有异常属性 ✓';
            this.$issuesList.appendChild(e);
            return;
        }
        issues.forEach(({ ctrl, member, prop }) => {
            const frag = document.importNode(this.$tplIssueItem.content, true);
            const badge = frag.querySelector('.badge-type');
            badge.textContent = prop.kind;
            badge.classList.add(prop.kind);
            frag.querySelector('.issue-prop').textContent = prop.display;
            frag.querySelector('.issue-node').textContent = `${member.nodeName} · ${ctrl.ctrlName || ctrl.ctrlId}`;
            frag.querySelector('.btn-issue-jump').addEventListener('click', () => {
                this._selectMember(ctrl, member, prop.propRef);
            });
            this.$issuesList.appendChild(frag);
        });
    },

    _findMember(nodeUuid) {
        const ctrls = (this.topology && this.topology.controllers) || [];
        for (const ctrl of ctrls) {
            for (const member of (ctrl.members || [])) {
                if (member.nodeUuid === nodeUuid) return { ctrl, member };
            }
        }
        return null;
    },

    // 选中成员: 加载矩阵 + 编辑器选中节点 (+ 可选高亮某属性行)
    _selectMember(ctrl, member, focusPropRef) {
        this.selMemberUuid = member.nodeUuid;
        this.matrixCtrl = ctrl;
        try { Editor.Selection.select('node', member.nodeUuid); } catch (e) { /* 静默 */ }
        this.renderMatrix(ctrl, member, focusPropRef);
        // 同步树高亮
        this.$topologyTree.querySelectorAll('.tree-node').forEach(el =>
            el.classList.toggle('is-selected', el.dataset.nodeUuid === member.nodeUuid));
        this.renderDashboard();
    },

    _clearMatrix() {
        this.$matrixHead.innerHTML = '';
        this.$matrixBody.innerHTML = '';
        this.$matrixTitle.textContent = '选择一个成员节点';
        this.$matrixEmpty.style.display = 'block';
        this.$valueMatrix.style.display = 'none';
    },

    renderMatrix(ctrl, member, focusPropRef) {
        const states = ctrl.states || [];
        const props = this._visibleProps(member, ctrl);
        this.$matrixTitle.textContent = `${member.nodeName} — ${ctrl.ctrlName || ctrl.ctrlId}`;

        if (!props.length || !states.length) {
            this.$matrixHead.innerHTML = '';
            this.$matrixBody.innerHTML = '';
            this.$matrixEmpty.style.display = 'block';
            this.$matrixEmpty.querySelector('p').textContent = states.length
                ? '该成员在当前过滤级别下没有可显示的属性。'
                : '该控制器还没有状态。';
            this.$valueMatrix.style.display = 'none';
            return;
        }
        this.$matrixEmpty.style.display = 'none';
        this.$valueMatrix.style.display = 'table';

        // 表头: 属性列 + 各状态列 (无 Default 列)
        this.$matrixHead.innerHTML = '';
        const thProp = document.createElement('th');
        thProp.textContent = '受控属性';
        this.$matrixHead.appendChild(thProp);
        states.forEach(state => {
            const thFrag = document.importNode(this.$tplMatrixTh.content, true);
            const th = thFrag.querySelector('th');
            th.textContent = state.name || `#${state.index + 1}`;
            if (state.index === ctrl.selectedIndex) th.classList.add('col-highlight');
            th.title = '点击切换到该状态';
            th.addEventListener('click', () => this._gotoState(ctrl, state));
            this.$matrixHead.appendChild(thFrag);
        });

        // 行
        this.$matrixBody.innerHTML = '';
        props.forEach(prop => {
            const rowFrag = document.importNode(this.$tplMatrixRow.content, true);
            const tr = rowFrag.querySelector('tr');
            if (prop.variesAcrossStates) tr.classList.add('row-changed');
            tr.dataset.propRef = prop.propRef;
            tr.querySelector('.prop-name').textContent = prop.display;
            tr.querySelector('.prop-type').textContent = prop.compName || '';

            states.forEach(state => {
                const cellFrag = document.importNode(this.$tplMatrixCell.content, true);
                const td = cellFrag.querySelector('td');
                if (state.index === ctrl.selectedIndex) td.classList.add('col-highlight');
                const explicit = prop.valueByState ? prop.valueByState[state.index] : undefined;
                const isGhost = explicit === undefined || explicit === null;
                const val = isGhost ? prop.defaultValue : explicit;
                this._fillCell(td, val, isGhost, prop.variesAcrossStates && !isGhost);
                tr.appendChild(td);
            });
            this.$matrixBody.appendChild(tr);

            if (focusPropRef && prop.propRef === focusPropRef) {
                tr.classList.add('row-focus');
                setTimeout(() => { try { tr.scrollIntoView({ block: 'nearest' }); } catch (e) {} }, 0);
            }
        });
    },

    _gotoState(ctrl, state) {
        const after = () => { this.refreshTopology(); if (this.currentCtrlUuid === ctrl.uuid) this.refreshSnapshot(); };
        if (typeof state.stateId === 'number') {
            this._callScene('set-state-by-id', { uuid: ctrl.uuid, stateId: state.stateId }, after);
        } else {
            this._callScene(SET_INDEX_MSG, { uuid: ctrl.uuid, index: state.index }, after);
        }
    },

    _reverseHighlight(nodeUuid) {
        if (this.activeView !== 'overview') return;
        const found = this._findMember(nodeUuid);
        if (!found) return;
        if (this.collapsedCtrls[found.ctrl.ctrlId]) { this.collapsedCtrls[found.ctrl.ctrlId] = false; }
        // 避免无限回环: 不再二次 Editor.Selection.select
        this.selMemberUuid = nodeUuid;
        this.matrixCtrl = found.ctrl;
        this.renderTopology();
        const el = this.$topologyTree.querySelector(`.tree-node[data-node-uuid="${nodeUuid}"]`);
        if (el) { try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
    },

    // 值格渲染: val 可能是 序列化叶子 / 多 ref 组合对象 / 基元
    _fillCell(td, val, isGhost, changed) {
        td.innerHTML = '';
        const wrap = this._renderValue(val);
        if (!wrap) { td.textContent = '—'; td.style.opacity = '.45'; return; }
        if (isGhost) wrap.classList.add('ghost-val');
        if (changed && wrap.classList.contains('val-vector')) wrap.classList.add('changed');
        td.appendChild(wrap);
    },

    _renderValue(val) {
        if (val === undefined || val === null) return null;
        const t = typeof val;
        if (t === 'boolean') {
            const s = document.createElement('span');
            s.className = 'val-bool ' + (val ? 't' : 'f');
            s.textContent = val ? '☑ TRUE' : '☒ FALSE';
            return s;
        }
        if (t === 'number' || t === 'string') {
            const s = document.createElement('span');
            s.className = 'val-vector';
            s.textContent = String(val);
            return s;
        }
        if (t === 'object') {
            const kind = val._t;
            if (kind === 'Color') {
                const wrap = document.createElement('span'); wrap.className = 'val-color';
                const sw = document.createElement('span'); sw.className = 'color-preview';
                sw.style.backgroundColor = this._rgbaCss(val);
                const txt = document.createElement('span'); txt.textContent = this._hex(val);
                wrap.appendChild(sw); wrap.appendChild(txt); return wrap;
            }
            if (kind === 'Asset') {
                const wrap = document.createElement('span'); wrap.className = 'val-image';
                const th = document.createElement('span'); th.className = 'img-thumb'; th.textContent = '🖼';
                const nm = document.createElement('span'); nm.className = 'img-name'; nm.textContent = String(val.id || 'asset');
                wrap.appendChild(th); wrap.appendChild(nm); return wrap;
            }
            const s = document.createElement('span'); s.className = 'val-vector';
            s.textContent = this._tupleText(val);
            return s;
        }
        const s = document.createElement('span'); s.className = 'val-vector'; s.textContent = String(val); return s;
    },

    _rgbaCss(c) { const a = (typeof c.a === 'number' ? c.a : 255) / 255; return `rgba(${c.r||0}, ${c.g||0}, ${c.b||0}, ${a})`; },
    _hex(c) { const h = (n) => ('0' + (n || 0).toString(16)).slice(-2); return ('#' + h(c.r) + h(c.g) + h(c.b)).toUpperCase(); },
    _tupleText(o) {
        if (o._t === 'Vec2') return `(${o.x}, ${o.y})`;
        if (o._t === 'Vec3') return `(${o.x}, ${o.y}, ${o.z})`;
        if (o._t === 'Quat') return `(${o.x}, ${o.y}, ${o.z}, ${o.w})`;
        if (o._t === 'Size') return `${o.width} × ${o.height}`;
        // 多 ref 组合对象 (如 Position {x,y}): 拼各叶子
        const parts = [];
        for (const k in o) { if (k === '_t') continue; parts.push(this._leafText(o[k])); }
        return `(${parts.join(', ')})`;
    },
    _leafText(v) {
        if (v === null || v === undefined) return '–';
        if (typeof v === 'object') return v._t ? this._tupleText(v) : JSON.stringify(v);
        return String(v);
    },

    // ============================================================
    // 编辑视图 (保留既有能力)
    // ============================================================
    _fetchInspectorFlags() {
        Editor.Ipc.sendToMain('state-controller-panel:inspector-get-flags', (err, flags) => {
            if (err) { Editor.warn('Failed to get inspector flags:', err); return; }
            if (flags) {
                this.$chkInspectorMaster.checked = !!flags.master;
                this.$chkInspectorViz.checked = !!flags.viz;
                this.$chkInspectorDirty.checked = !!flags.dirty;
                this.$chkInspectorExclude.checked = !!flags.exclude;
                this._updateInspectorSubToggles();
            }
        });
    },
    _updateInspectorSubToggles() {
        const on = this.$chkInspectorMaster.checked;
        this.$chkInspectorViz.disabled = !on;
        this.$chkInspectorDirty.disabled = !on;
        this.$chkInspectorExclude.disabled = !on;
        this.$inspectorSubToggles.classList.toggle('is-disabled', !on);
    },
    _syncInspectorSubFlags() {
        Editor.Ipc.sendToMain('state-controller-panel:inspector-set-flags', {
            master: true,
            viz: !!this.$chkInspectorViz.checked,
            dirty: !!this.$chkInspectorDirty.checked,
            exclude: !!this.$chkInspectorExclude.checked,
        });
    },
    _setRecording(isRecording) {
        if (!this.currentCtrlUuid || !this.currentSnapshot) return;
        this._callScene('set-recording', { uuid: this.currentCtrlUuid, isRecording }, (err) => {
            if (err) Editor.warn(err);
            this.refreshSnapshot();
        });
    },
    _stepCtrl(step) {
        if (!this.ctrlItems.length) return;
        const now = this.ctrlItems.findIndex(item => item.uuid === this.currentCtrlUuid);
        const base = now >= 0 ? now : 0;
        const next = (base + step + this.ctrlItems.length) % this.ctrlItems.length;
        this.setCurrentCtrl(this.ctrlItems[next].uuid);
    },
    _stepState() {
        if (!this.currentCtrlUuid || !this.currentSnapshot) return;
        const states = this.currentSnapshot.states || [];
        if (!states.length) return;
        const activeIndex = this._activeIndex(this.currentSnapshot);
        const pos = states.findIndex(state => state.index === activeIndex);
        const next = states[(pos + 1 + states.length) % states.length];
        if (!next) return;
        this._goState(next);
    },
    refreshCtrlList() {
        if (this.activeView !== 'editor') return;
        this._callScene('list-ctrls', null, (err, list) => {
            if (err) { if (!this._initialFetch) Editor.error(err); this._initialFetch = false; return; }
            this._initialFetch = false;
            this.ctrlItems = Array.isArray(list) ? list : [];
            this.$ctrlList.innerHTML = '';
            if (!this.ctrlItems.length) { this.setCurrentCtrl(null); return; }
            this.ctrlItems.forEach(item => {
                const node = document.importNode(this.$tplCtrlItem.content, true);
                node.querySelector('.ctrl-name').textContent = this._ctrlLabel(item);
                node.querySelector('.btn-use-ctrl').addEventListener('click', () => this.setCurrentCtrl(item.uuid));
                this.$ctrlList.appendChild(node);
            });
            if (!this.currentCtrlUuid || !this.ctrlItems.some(item => item.uuid === this.currentCtrlUuid)) {
                this.setCurrentCtrl(this.ctrlItems[0].uuid);
            } else {
                this._renderCtrlHeader();
            }
        });
    },
    setCurrentCtrl(uuid) {
        this.currentCtrlUuid = uuid;
        this.currentSnapshot = null;
        if (!uuid) {
            this.$emptyTip.style.display = 'flex';
            this.$stateDetail.style.display = 'none';
            this.$statesList.innerHTML = '';
            this._renderCtrlHeader();
            return;
        }
        this.$emptyTip.style.display = 'none';
        this.$stateDetail.style.display = 'flex';
        this._renderCtrlHeader();
        this.refreshSnapshot();
    },
    refreshSnapshot() {
        if (!this.currentCtrlUuid) return;
        const ctrlUuid = this.currentCtrlUuid;
        this._callScene('get-ctrl-snapshot', { uuid: ctrlUuid }, (err, snapshot) => {
            if (ctrlUuid !== this.currentCtrlUuid) return;
            if (err || !snapshot) { Editor.warn('未能获取 controller 快照: ', err); this.setCurrentCtrl(null); return; }
            this.currentSnapshot = snapshot;
            if (this.activeView === 'editor') this.renderUI();
        });
    },
    renderUI() {
        if (!this.currentSnapshot) return;
        this._renderCtrlHeader();
        this.renderStates();
        this.renderDetail();
        this.renderProps();
    },
    renderStates() {
        const snap = this.currentSnapshot;
        const states = snap.states || [];
        const activeIndex = this._activeIndex(snap);
        const locked = !!snap.isRecording;
        this.$statesList.innerHTML = '';
        this.$statesList.classList.toggle('locked', locked);
        this.$btnAddState.disabled = locked;
        this.$btnAddState.classList.toggle('is-disabled', locked);
        states.forEach(state => {
            const node = document.importNode(this.$tplStateItem.content, true);
            const item = node.querySelector('.state-item');
            const isActive = state.index === activeIndex;
            item.classList.toggle('is-active', isActive);
            node.querySelector('.state-name').textContent = state.name || `State ${state.index + 1}`;
            node.querySelector('.state-sub').textContent = typeof state.stateId === 'number' ? `id ${state.stateId}` : `#${state.index + 1}`;
            node.querySelector('.record-dot').style.display = (locked && isActive) ? 'inline' : 'none';
            item.addEventListener('click', (event) => {
                if (event.target.closest('.btn-del-state')) return;
                if (isActive) return;
                this._goState(state);
            });
            const delBtn = node.querySelector('.btn-del-state');
            delBtn.disabled = locked;
            delBtn.classList.toggle('is-disabled', locked);
            delBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (locked) return;
                this._callScene('remove-state', { uuid: this.currentCtrlUuid, index: state.index }, (err) => {
                    if (err) Editor.warn(err);
                    this.refreshSnapshot();
                });
            });
            this.$statesList.appendChild(node);
        });
    },
    renderDetail() {
        const snap = this.currentSnapshot;
        const states = snap.states || [];
        const activeIndex = this._activeIndex(snap);
        const activeState = states.find(state => state.index === activeIndex);
        const name = activeState ? activeState.name : '--';
        const pos = states.findIndex(state => state.index === activeIndex);
        const caption = states.length ? `${pos + 1}/${states.length} · ${name}` : '--';
        const recording = !!snap.isRecording;
        this.$btnStatePick.textContent = `${caption} ▾`;
        this.$stateTitle.textContent = name;
        this.$recordBadge.textContent = recording ? 'Recording' : 'Idle';
        this.$recordBadge.classList.toggle('is-live', recording);
        this.$btnStartRecord.style.display = recording ? 'none' : 'inline-flex';
        this.$btnStopRecord.style.display = recording ? 'inline-flex' : 'none';
        this.$btnCancelRecord.style.display = recording ? 'inline-flex' : 'none';
    },
    renderProps() {
        if (!this.currentSnapshot) return;
        const groups = this._propGroups(this.currentSnapshot);
        this.$followedCount.textContent = `(${groups.followed.length})`;
        this.$readyCount.textContent = `(${groups.ready.length})`;
        this.$btnFollowedToggle.firstChild.nodeValue = this.folded.followed ? '▸ 已跟随属性 ' : '▾ 已跟随属性 ';
        this.$btnReadyToggle.firstChild.nodeValue = this.folded.ready ? '▸ 可接入属性 ' : '▾ 可接入属性 ';
        this.$followedProps.innerHTML = '';
        this.$readyProps.innerHTML = '';
        this.$followedProps.style.display = this.folded.followed ? 'none' : 'flex';
        this.$readyProps.style.display = this.folded.ready ? 'none' : 'flex';
        this._renderPropGroup(this.$followedProps, groups.followed, { mark: '●', action: '☐ 取消跟随', method: 'remove-property', empty: '暂无已跟随属性' });
        this._renderPropGroup(this.$readyProps, groups.ready, { mark: '○', action: '☑ 加入跟随', method: 'add-property', empty: '暂无可接入属性' });
    },
    _renderPropGroup(container, items, cfg) {
        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'prop-empty';
            empty.textContent = cfg.empty;
            container.appendChild(empty);
            return;
        }
        items.forEach(prop => {
            const node = document.importNode(this.$tplPropItem.content, true);
            node.querySelector('.prop-mark').textContent = cfg.mark;
            node.querySelector('.prop-name').textContent = prop.name;
            node.querySelector('.prop-value').textContent = prop.valueText || '';
            const btn = node.querySelector('.btn-prop-action');
            btn.textContent = cfg.action;
            btn.addEventListener('click', () => this._mutateProp(cfg.method, prop));
            container.appendChild(node);
        });
    },
    _mutateProp(method, prop) {
        if (!this.currentCtrlUuid) return;
        const nodeUuid = prop.nodeUuid || this._activeNodeUuid() || this.currentCtrlUuid;
        if (!nodeUuid) { Editor.warn('未找到可操作节点'); return; }
        const payload = { ctrlUuid: this.currentCtrlUuid, propType: prop.propType };
        payload[NODE_UUID_KEY] = nodeUuid;
        this._callScene(method, payload, (err) => {
            if (err) Editor.warn(err);
            this.refreshSnapshot();
        });
    },
    _goState(state) {
        if (!state || !this.currentCtrlUuid) return;
        if (typeof state.stateId === 'number') {
            this._callScene('set-state-by-id', { uuid: this.currentCtrlUuid, stateId: state.stateId }, () => this.refreshSnapshot());
            return;
        }
        this._callScene(SET_INDEX_MSG, { uuid: this.currentCtrlUuid, index: state.index }, () => this.refreshSnapshot());
    },
    _activeIndex(snap) { return typeof snap[SNAP_INDEX_KEY] === 'number' ? snap[SNAP_INDEX_KEY] : 0; },
    _ctrlLabel(item) { if (!item) return '未连接'; return item.ctrlName || `Controller ${item.ctrlId}`; },
    _renderCtrlHeader() {
        const item = this.ctrlItems.find(ctrl => ctrl.uuid === this.currentCtrlUuid);
        const count = this.ctrlItems.length;
        const label = item ? this._ctrlLabel(item) : '未连接';
        this.$btnCtrlSwitch.textContent = count > 1 ? `${label} ▾` : label;
        this.$btnPrevCtrl.disabled = count <= 1;
        this.$btnNextCtrl.disabled = count <= 1;
    },
    _activeNodeUuid() {
        if (!Editor.Selection || typeof Editor.Selection.curSelection !== 'function') return null;
        const nodes = Editor.Selection.curSelection('node');
        return nodes && nodes.length ? nodes[0] : null;
    },
    _propGroups(snap) {
        const rawProps = Array.isArray(snap.props) ? snap.props : null;
        let followed = [];
        let ready = [];
        if (rawProps) {
            rawProps.forEach(raw => {
                const entry = this._propEntry(raw);
                if (!entry) return;
                if (raw && typeof raw === 'object' && raw.followed === false) ready.push(entry);
                else followed.push(entry);
            });
        }
        const followedSources = snap.followedProps || snap.controlledProps;
        if (Array.isArray(followedSources)) followed = followedSources.map(raw => this._propEntry(raw)).filter(Boolean);
        const readySources = snap.readyProps || snap.availableProps || snap.applicableProps;
        if (Array.isArray(readySources)) {
            ready = readySources.map(raw => this._propEntry(raw)).filter(Boolean);
        } else {
            const used = {};
            followed.forEach(prop => { used[prop.propType] = true; });
            ready = KNOWN_PROPS.filter(prop => !used[prop.propType]).map(prop => this._propEntry(prop));
        }
        return { followed, ready };
    },
    _propEntry(raw) {
        if (!raw && raw !== 0) return null;
        if (typeof raw === 'string' || typeof raw === 'number') {
            return { name: String(raw), propType: raw, valueText: '', nodeUuid: null };
        }
        const propType = raw.propType || raw.type || raw.name || raw.propName;
        if (!propType && propType !== 0) return null;
        return {
            name: raw.name || raw.propName || String(propType),
            propType,
            valueText: raw.valueText || raw.displayValue || this._formatValue(raw.value),
            nodeUuid: raw.nodeUuid || raw.uuid || raw.targetUuid || raw[NODE_UUID_KEY] || null,
        };
    },
    _formatValue(value) {
        if (value === undefined || value === null) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (Array.isArray(value)) return `(${value.join(', ')})`;
        if (typeof value === 'object') {
            if ('x' in value && 'y' in value) return `(${value.x}, ${value.y}${'z' in value ? ', ' + value.z : ''})`;
            if ('r' in value && 'g' in value && 'b' in value) return `rgb(${value.r}, ${value.g}, ${value.b})`;
        }
        return String(value);
    },

    // ============================================================
    // 主进程 / scene-script 广播
    // ============================================================
    messages: {
        'scene:reloaded'() { this.refreshTopology(); this.refreshCtrlList(); },
        'state-controller-panel:scene-ready'() { this.refreshTopology(); this.refreshCtrlList(); },
        'state-controller-panel:on-state-changed'(event, payload) {
            this.refreshTopology();
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
        'state-controller-panel:on-recording-changed'(event, payload) {
            this.refreshTopology();
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
        'state-controller-panel:on-recording-cancelled'(event, payload) {
            this.refreshTopology();
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
        'state-controller-panel:on-data-changed'(event, payload) {
            this.refreshTopology();
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
    },
    _isActivePayload(payload) {
        if (!payload || !this.currentSnapshot) return true;
        return payload.ctrlId === this.currentSnapshot.ctrlId;
    },
};
