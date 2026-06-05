'use strict';

const SNAP_INDEX_KEY = 'sel' + 'ectedIndex';
const NODE_UUID_KEY = 'sel' + 'ectUuid';
const SET_INDEX_MSG = 'set-' + 'sel' + 'ected-index';

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
        tabBindings: '#tab-bindings',
        viewBindings: '#view-bindings',
        bindSourceCtrl: '#bind-source-ctrl',
        bindSourceState: '#bind-source-state',
        bindTargetCtrl: '#bind-target-ctrl',
        bindTargetState: '#bind-target-state',
        btnAddBinding: '#btn-add-binding',
        bindingsGraph: '#bindings-graph',
        bindingsEmpty: '#bindings-empty',
        bindingsForm: '#bindings-form',
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
        overviewBody: '#overview-body',
        // inspector flags
        chkInspectorMaster: '#chk-inspector-master',
        chkInspectorViz: '#chk-inspector-viz',
        chkInspectorDirty: '#chk-inspector-dirty',
        chkInspectorExclude: '#chk-inspector-exclude',
        inspectorSubToggles: '#inspector-sub-toggles',
        // 编辑视图
        statesList: '#states-list',
        btnAddState: '#btn-add-state',
        // 回收站
        recycleBin: '#recycle-bin',
        binHeader: '#bin-header',
        binCount: '#bin-count',
        binBody: '#bin-body',
        binList: '#bin-list',
        btnPurgeAll: '#btn-purge-all',
        tplBinItem: '#tpl-bin-item',
        // 回收态预览横幅
        previewBanner: '#preview-banner',
        pvName: '#pv-name',
        btnPreviewRestore: '#btn-preview-restore',
        btnPreviewExit: '#btn-preview-exit',
        // 自定义确认弹窗
        confirmModal: '#confirm-modal',
        cmBackdrop: '#cm-backdrop',
        cmTitle: '#cm-title',
        cmBody: '#cm-body',
        cmCancel: '#cm-cancel',
        cmConfirm: '#cm-confirm',
        stateDetail: '#state-detail',
        emptyTip: '#empty-tip',
        emptyTipTitle: '#empty-tip-title',
        ctrlListHint: '#ctrl-list-hint',
        ctrlList: '#ctrl-list',
        btnPrevCtrl: '#btn-prev-ctrl',
        ctrlSwitchSelect: '#ctrl-switch-select',
        btnNextCtrl: '#btn-next-ctrl',
        statePickSelect: '#state-pick-select',
        stateTitle: '#state-title',
        recordBadge: '#record-badge',
        btnStartRecord: '#btn-start-record',
        btnStopRecord: '#btn-stop-record',
        btnCancelRecord: '#btn-cancel-record',
        editorMatrix: '#editor-matrix',
        chkShowAllProps: '#chk-show-all-props',
        // 属性详情抽屉
        propDetail: '#prop-detail',
        pdBackdrop: '#pd-backdrop',
        pdClose: '#pd-close',
        pdName: '#pd-name',
        pdType: '#pd-type',
        pdBody: '#pd-body',
        // 模板
        tplStateItem: '#tpl-state-item',
        tplCtrlItem: '#tpl-ctrl-item',
        tplDashboardCard: '#tpl-dashboard-card',
        tplTreeCtrl: '#tpl-tree-ctrl',
        tplTreeNode: '#tpl-tree-node',
        tplTreeProp: '#tpl-tree-prop',
        tplMatrixTh: '#tpl-matrix-th',
        tplMatrixRow: '#tpl-matrix-row',
        tplMatrixCell: '#tpl-matrix-cell',
        tplIssueItem: '#tpl-issue-item',
        tplBindingEdge: '#tpl-binding-edge',
    },

    ready() {
        // 编辑视图状态
        this.currentCtrlUuid = null;
        this.currentSnapshot = null;
        this.ctrlItems = [];
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
        Editor.Scene.callSceneScript('state-controller-v2-panel', method, payload || null, cb || function () {});
    },

    // 初次拉取: 纯事件驱动, 先问场景是否就绪 (避免 scene-script 未注册时盲调告警).
    _initialRefresh() {
        Editor.Ipc.sendToMain('state-controller-v2-panel:is-scene-ready', (err, ready) => {
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
        this.$tabBindings.addEventListener('click', () => this.switchView('bindings'));

        // --- 观测过滤 / 搜索 ---
        this.$filterLevel.addEventListener('change', () => this.renderTopology());
        this.$searchInput.addEventListener('input', () => this.renderTopology());

        // --- 联动关系表单 ---
        this.$bindSourceCtrl.addEventListener('change', () => this._fillStateOptions(this.$bindSourceCtrl, this.$bindSourceState));
        this.$bindTargetCtrl.addEventListener('change', () => this._fillStateOptions(this.$bindTargetCtrl, this.$bindTargetState));
        this.$btnAddBinding.addEventListener('click', () => this._addBindingFromForm());

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
        // --- 回收站 ---
        this.$binHeader.addEventListener('click', () => {
            this.$recycleBin.classList.toggle('is-collapsed');
        });
        this.$btnPurgeAll.addEventListener('click', () => {
            if (!this._binActionable()) return;
            const n = (this.currentSnapshot.deletedStates || []).length;
            if (!n) return;
            this._confirm({
                title: '清空回收站？',
                body: `将彻底删除回收站里全部 ${n} 个状态的数据，<b>不可恢复</b>。`,
                confirmLabel: '清空回收站',
            }, () => {
                this._callScene('purge-all-deleted-states', { uuid: this.currentCtrlUuid }, (err) => {
                    if (err) Editor.warn(err);
                    this.refreshSnapshot();
                });
            });
        });

        // --- 回收态预览横幅 ---
        this.$btnPreviewExit.addEventListener('click', () => {
            if (!this.currentCtrlUuid) return;
            this._callScene('exit-preview', { uuid: this.currentCtrlUuid }, () => this.refreshSnapshot());
        });
        this.$btnPreviewRestore.addEventListener('click', () => {
            if (!this.currentCtrlUuid || !this.currentSnapshot) return;
            const id = this.currentSnapshot.previewingStateId;
            if (typeof id !== 'number' || id < 0) return;
            this._callScene('restore-deleted-state', { uuid: this.currentCtrlUuid, stateId: id }, (err) => {
                if (err) Editor.warn(err);
                this.refreshSnapshot();
            });
        });

        // --- 自定义确认弹窗 ---
        this.$cmCancel.addEventListener('click', () => this._closeConfirm());
        this.$cmBackdrop.addEventListener('click', () => this._closeConfirm());
        this.$cmConfirm.addEventListener('click', () => {
            const cb = this._confirmCb;
            this._closeConfirm();
            if (typeof cb === 'function') cb();
        });
        this.$btnPrevCtrl.addEventListener('click', () => this._stepCtrl(-1));
        this.$btnNextCtrl.addEventListener('click', () => this._stepCtrl(1));
        // 下拉直选控制器 / 状态 (替代旧的「点击跳下一个」)
        this.$ctrlSwitchSelect.addEventListener('change', () => {
            if (this.$ctrlSwitchSelect.value) this.setCurrentCtrl(this.$ctrlSwitchSelect.value, true);
        });
        this.$statePickSelect.addEventListener('change', () => {
            const idx = Number(this.$statePickSelect.value);
            const states = (this.currentSnapshot && this.currentSnapshot.states) || [];
            const st = states.find(s => s.index === idx);
            if (st) this._goState(st);
        });
        this.$btnStartRecord.addEventListener('click', () => this._setRecording(true));
        this.$btnStopRecord.addEventListener('click', () => this._setRecording(false));
        this.$btnCancelRecord.addEventListener('click', () => {
            if (!this.currentCtrlUuid) return;
            this._callScene('cancel-recording', { uuid: this.currentCtrlUuid }, (err) => {
                if (err) Editor.warn(err);
                this.refreshSnapshot();
            });
        });
        this.$chkShowAllProps.addEventListener('change', () => this.renderEditorMatrix());
        this.$pdClose.addEventListener('click', () => this._closePropDetail());
        this.$pdBackdrop.addEventListener('click', () => this._closePropDetail());

        this.$chkInspectorMaster.addEventListener('change', () => {
            this._updateInspectorSubToggles();
            if (this.$chkInspectorMaster.checked) Editor.Ipc.sendToMain('state-controller-v2-panel:inspector-mark-on');
            else Editor.Ipc.sendToMain('state-controller-v2-panel:inspector-mark-off');
        });
        const onSubFlagChange = () => { if (this.$chkInspectorMaster.checked) this._syncInspectorSubFlags(); };
        this.$chkInspectorViz.addEventListener('change', onSubFlagChange);
        this.$chkInspectorDirty.addEventListener('change', onSubFlagChange);
        this.$chkInspectorExclude.addEventListener('change', onSubFlagChange);
    },

    switchView(view) {
        this.activeView = view;
        this.$tabOverview.classList.toggle('is-active', view === 'overview');
        this.$tabEditor.classList.toggle('is-active', view === 'editor');
        this.$tabBindings.classList.toggle('is-active', view === 'bindings');
        this.$overviewActions.style.display = view === 'overview' ? 'flex' : 'none';
        this.$editorActions.style.display = view === 'editor' ? 'flex' : 'none';
        this.$viewOverview.style.display = view === 'overview' ? 'flex' : 'none';
        this.$viewEditor.style.display = view === 'editor' ? 'flex' : 'none';
        this.$viewBindings.style.display = view === 'bindings' ? 'flex' : 'none';
        if (view === 'overview') this.refreshTopology();
        else if (view === 'editor') { this.refreshCtrlList(); this.refreshTopology(); }
        else this.refreshBindings();
    },

    // ============================================================
    // 观测总览
    // ============================================================
    refreshTopology() {
        if (this.activeView === 'bindings') return;
        this._callScene('list-scene-topology', null, (err, topology) => {
            if (err) { if (!this._initialFetch) Editor.warn(err); return; }
            this.topology = topology || { controllers: [] };
            if (this.activeView === 'overview') this.renderTopology();
            else if (this.activeView === 'editor') this.renderEditorMatrix();
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
        const empty = !ctrls.length;
        // 空态: 只显示「场景里还没有控制器」, 隐藏三栏工作区 + 仪表盘, 并清掉上一个预制体残留的矩阵/选中
        this.$overviewEmpty.style.display = empty ? 'flex' : 'none';
        this.$overviewBody.style.display = empty ? 'none' : 'flex';
        this.$dashboardGrid.style.display = empty ? 'none' : '';
        this.$topologyTree.innerHTML = '';
        if (empty) {
            this.selMemberUuid = null;
            this.matrixCtrl = null;
            this._clearMatrix();
            this.renderIssues();
            return;
        }

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
        this._buildMatrix(this.$matrixHead, this.$matrixBody, ctrl, props, { focusPropRef });
    },

    // 共享矩阵渲染: headTr=<tr> / tbody=<tbody>. opts.onCancel(prop) 启用行尾「取消跟随」.
    _buildMatrix(headTr, tbody, ctrl, props, opts) {
        opts = opts || {};
        const states = ctrl.states || [];
        const selIdx = (opts.selectedIndex !== undefined) ? opts.selectedIndex : ctrl.selectedIndex;

        headTr.innerHTML = '';
        const thProp = document.createElement('th');
        thProp.textContent = '受控属性';
        headTr.appendChild(thProp);
        states.forEach(state => {
            const thFrag = document.importNode(this.$tplMatrixTh.content, true);
            const th = thFrag.querySelector('th');
            th.textContent = state.name || `#${state.index + 1}`;
            if (state.index === selIdx) th.classList.add('col-highlight');
            th.title = '点击切换到该状态';
            th.addEventListener('click', () => this._gotoState(ctrl, state));
            headTr.appendChild(thFrag);
        });

        tbody.innerHTML = '';
        props.forEach(prop => {
            const rowFrag = document.importNode(this.$tplMatrixRow.content, true);
            const tr = rowFrag.querySelector('tr');
            if (prop.variesAcrossStates) tr.classList.add('row-changed');
            tr.dataset.propRef = prop.propRef;
            const propCell = tr.querySelector('.matrix-prop');
            propCell.querySelector('.prop-name').textContent = prop.display;
            propCell.querySelector('.prop-type').textContent = prop.compName || '';
            // 点属性名格 → 详情抽屉 (逐状态看全值)
            propCell.classList.add('clickable');
            propCell.title = '点击查看各状态完整值';
            propCell.addEventListener('click', (e) => {
                if (e.target.closest('.em-cancel')) return;
                this._openPropDetail(ctrl, prop, selIdx);
            });
            if (opts.onCancel) {
                const btn = document.createElement('button');
                btn.className = 'nb-btn btn-small em-cancel';
                btn.textContent = '✕';
                btn.title = '取消跟随该属性';
                btn.addEventListener('click', (e) => { e.stopPropagation(); opts.onCancel(prop); });
                propCell.appendChild(btn);
            }

            states.forEach(state => {
                const cellFrag = document.importNode(this.$tplMatrixCell.content, true);
                const td = cellFrag.querySelector('td');
                if (state.index === selIdx) td.classList.add('col-highlight');
                const explicit = prop.valueByState ? prop.valueByState[state.index] : undefined;
                const isGhost = explicit === undefined || explicit === null;
                const val = isGhost ? prop.defaultValue : explicit;
                this._fillCell(td, val, isGhost, prop.variesAcrossStates && !isGhost);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);

            if (opts.focusPropRef && prop.propRef === opts.focusPropRef) {
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
        // 长值(UUID/资源)截断后靠 title 看全
        const full = wrap.textContent || '';
        if (full) td.title = isGhost ? `${full}（未录制, 回退默认）` : full;
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
    // 联动关系图 (支柱 B)
    // ============================================================
    refreshBindings() {
        if (this.activeView !== 'bindings') return;
        this._callScene('list-scene-topology', null, (err, topology) => {
            if (err) { if (!this._initialFetch) Editor.warn(err); return; }
            this.topology = topology || { controllers: [] };
            this.renderBindings();
        });
    },

    renderBindings() {
        const ctrls = (this.topology && this.topology.controllers) || [];
        const byId = {};
        ctrls.forEach(c => { byId[c.ctrlId] = c; });
        this._ctrlById = byId;

        // 无控制器: 联动表单不可用, 隐藏表单并把空态文案改为「场景里还没有控制器」
        const noCtrl = !ctrls.length;
        if (this.$bindingsForm) this.$bindingsForm.style.display = noCtrl ? 'none' : '';
        if (noCtrl) {
            this.$bindingsGraph.innerHTML = '';
            const h = this.$bindingsEmpty.querySelector('h3');
            const p = this.$bindingsEmpty.querySelector('p');
            if (h) h.textContent = '场景里还没有控制器';
            if (p) p.textContent = '给节点挂上 StateControllerV2 并接入控制后, 再来这里建立跨控制器联动。';
            this.$bindingsEmpty.style.display = 'flex';
            return;
        }
        const h = this.$bindingsEmpty.querySelector('h3');
        const p = this.$bindingsEmpty.querySelector('p');
        if (h) h.textContent = '还没有任何跨控制器联动';
        if (p) p.textContent = '用上方表单建立「A 切到某状态 → B 自动切到某状态」的声明式联动。';

        this._fillCtrlOptions(this.$bindSourceCtrl);
        this._fillCtrlOptions(this.$bindTargetCtrl);
        this._fillStateOptions(this.$bindSourceCtrl, this.$bindSourceState);
        this._fillStateOptions(this.$bindTargetCtrl, this.$bindTargetState);

        this.$bindingsGraph.innerHTML = '';
        let any = false;
        ctrls.forEach(src => {
            const binds = src.bindings || [];
            if (!binds.length) return;
            any = true;
            const cap = document.createElement('div');
            cap.className = 'bind-group-cap';
            cap.textContent = `🎮 ${src.ctrlName || src.ctrlId}`;
            this.$bindingsGraph.appendChild(cap);
            binds.forEach(b => {
                const tgt = byId[b.targetCtrlId];
                const frag = document.importNode(this.$tplBindingEdge.content, true);
                const edge = frag.querySelector('.bind-edge');
                if (!tgt) edge.classList.add('broken');
                frag.querySelector('.bind-src .bind-ctrl').textContent = src.ctrlName || src.ctrlId;
                frag.querySelector('.bind-src .bind-state').textContent = this._stateName(src, b.sourceStateId);
                frag.querySelector('.bind-tgt .bind-ctrl').textContent = tgt ? (tgt.ctrlName || tgt.ctrlId) : `? (id ${b.targetCtrlId})`;
                frag.querySelector('.bind-tgt .bind-state').textContent = tgt ? this._stateName(tgt, b.targetStateId) : `state ${b.targetStateId}`;
                frag.querySelector('.btn-del-binding').addEventListener('click', () => this._removeBinding(src, b));
                this.$bindingsGraph.appendChild(frag);
            });
        });
        this.$bindingsEmpty.style.display = any ? 'none' : 'flex';
    },

    _stateName(ctrl, stateId) {
        const s = (ctrl.states || []).find(st => st.stateId === stateId);
        return s ? (s.name || `#${s.index + 1}`) : `id ${stateId}`;
    },

    _fillCtrlOptions(sel) {
        const ctrls = (this.topology && this.topology.controllers) || [];
        const prev = sel.value;
        sel.innerHTML = '';
        ctrls.forEach(c => {
            const o = document.createElement('option');
            o.value = String(c.ctrlId);
            o.textContent = c.ctrlName || `Controller ${c.ctrlId}`;
            sel.appendChild(o);
        });
        if (prev && ctrls.some(c => String(c.ctrlId) === prev)) sel.value = prev;
    },

    _fillStateOptions(ctrlSel, stateSel) {
        const ctrl = this._ctrlById && this._ctrlById[ctrlSel.value];
        const prev = stateSel.value;
        stateSel.innerHTML = '';
        if (!ctrl) return;
        (ctrl.states || []).forEach(s => {
            const o = document.createElement('option');
            o.value = String(s.stateId);
            o.textContent = s.name || `#${s.index + 1}`;
            stateSel.appendChild(o);
        });
        if (prev && (ctrl.states || []).some(s => String(s.stateId) === prev)) stateSel.value = prev;
    },

    _addBindingFromForm() {
        const srcId = Number(this.$bindSourceCtrl.value);
        const tgtId = Number(this.$bindTargetCtrl.value);
        const sStateId = Number(this.$bindSourceState.value);
        const tStateId = Number(this.$bindTargetState.value);
        const src = this._ctrlById && this._ctrlById[srcId];
        if (!src || isNaN(srcId) || isNaN(tgtId) || isNaN(sStateId) || isNaN(tStateId)) {
            Editor.warn('联动参数不完整, 请确认场景里有控制器与状态');
            return;
        }
        this._callScene('add-binding', { uuid: src.uuid, sourceStateId: sStateId, targetCtrlId: tgtId, targetStateId: tStateId }, (err) => {
            if (err) Editor.warn(err);
            this.refreshBindings();
        });
    },

    _removeBinding(src, b) {
        this._callScene('remove-binding', { uuid: src.uuid, sourceStateId: b.sourceStateId, targetCtrlId: b.targetCtrlId }, (err) => {
            if (err) Editor.warn(err);
            this.refreshBindings();
        });
    },

    // ============================================================
    // 编辑视图 (保留既有能力)
    // ============================================================
    _fetchInspectorFlags() {
        Editor.Ipc.sendToMain('state-controller-v2-panel:inspector-get-flags', (err, flags) => {
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
        Editor.Ipc.sendToMain('state-controller-v2-panel:inspector-set-flags', {
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
        this.setCurrentCtrl(this.ctrlItems[next].uuid, true);
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
            // 空态文案: 无控制器 → 「场景里还没有控制器」并隐藏「从下方列表选择」提示; 有控制器仅未选中 → 提示从列表选
            const noCtrl = !this.ctrlItems.length;
            if (this.$emptyTipTitle) this.$emptyTipTitle.textContent = noCtrl ? '场景里还没有控制器' : '请在场景中选中带 StateControllerV2 的节点';
            if (this.$ctrlListHint) this.$ctrlListHint.style.display = noCtrl ? 'none' : '';
            if (noCtrl) { this.setCurrentCtrl(null); return; }
            this.ctrlItems.forEach(item => {
                const node = document.importNode(this.$tplCtrlItem.content, true);
                node.querySelector('.ctrl-name').textContent = this._ctrlLabel(item);
                node.querySelector('.btn-use-ctrl').addEventListener('click', () => this.setCurrentCtrl(item.uuid, true));
                this.$ctrlList.appendChild(node);
            });
            if (!this.currentCtrlUuid || !this.ctrlItems.some(item => item.uuid === this.currentCtrlUuid)) {
                this.setCurrentCtrl(this.ctrlItems[0].uuid);
            } else {
                this._renderCtrlHeader();
            }
        });
    },
    setCurrentCtrl(uuid, selectNode) {
        this.currentCtrlUuid = uuid;
        this.currentSnapshot = null;
        if (!uuid) {
            this.$emptyTip.style.display = 'flex';
            this.$stateDetail.style.display = 'none';
            this.$statesList.innerHTML = '';
            this._renderCtrlHeader();
            return;
        }
        // 用户显式切控制器 → 场景里同步选中该控制器节点 (uuid 即节点 uuid)
        if (selectNode) { try { Editor.Selection.select('node', uuid); } catch (e) { /* 静默 */ } }
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
            if (this.activeView === 'editor') {
                this.renderUI();
                this.refreshTopology();   // 矩阵真数据来自 topology, 录制/切状态后必须同步重取
            }
        });
    },
    renderUI() {
        if (!this.currentSnapshot) return;
        this._renderCtrlHeader();
        this.renderPreviewBanner();
        this.renderStates();
        this.renderBin();
        this.renderDetail();
        this.renderEditorMatrix();
    },
    // 预览中 = 锁定结构操作 (同录制): 状态切换/新增/删除/恢复/录制 全锁, 唯一出口是横幅
    _isLocked(snap) {
        return !!(snap && (snap.isRecording || (typeof snap.previewingStateId === 'number' && snap.previewingStateId >= 0)));
    },
    _previewingId(snap) {
        return (snap && typeof snap.previewingStateId === 'number') ? snap.previewingStateId : -1;
    },
    renderPreviewBanner() {
        const snap = this.currentSnapshot;
        const id = this._previewingId(snap);
        if (id < 0) { this.$previewBanner.style.display = 'none'; return; }
        const item = (snap.deletedStates || []).find(d => d.stateId === id);
        this.$pvName.textContent = item ? `「${item.name}」(id ${id})` : `id ${id}`;
        this.$previewBanner.style.display = 'flex';
    },
    renderStates() {
        const snap = this.currentSnapshot;
        const states = snap.states || [];
        const activeIndex = this._activeIndex(snap);
        const locked = this._isLocked(snap);
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
                const ok = typeof confirm === 'function'
                    ? confirm(`移除状态「${state.name || state.index}」？数据会移入回收站，可恢复。`)
                    : true;
                if (!ok) return;
                this._callScene('remove-state', { uuid: this.currentCtrlUuid, index: state.index }, (err) => {
                    if (err) Editor.warn(err);
                    this.refreshSnapshot();
                });
            });
            this.$statesList.appendChild(node);
        });
    },
    // 回收站可操作前置: 有控制器/快照, 且不在录制 (录制中锁结构操作, 与 states 列表一致)
    _binActionable() {
        return !!(this.currentCtrlUuid && this.currentSnapshot && !this.currentSnapshot.isRecording);
    },
    renderBin() {
        const snap = this.currentSnapshot;
        const deleted = (snap && snap.deletedStates) || [];
        const locked = this._isLocked(snap);
        const previewingId = this._previewingId(snap);
        this.$binCount.textContent = String(deleted.length);
        // 空回收站: 折叠并隐藏整个区块, 不占视觉
        this.$recycleBin.style.display = deleted.length ? '' : 'none';
        this.$recycleBin.classList.toggle('locked', locked);
        this.$binList.innerHTML = '';
        deleted.forEach(item => {
            const frag = document.importNode(this.$tplBinItem.content, true);
            frag.querySelector('.bin-name').textContent = item.name || `#${item.stateId}`;
            frag.querySelector('.bin-sub').textContent = `id ${item.stateId}`;
            const previewBtn = frag.querySelector('.btn-bin-preview');
            const restoreBtn = frag.querySelector('.btn-bin-restore');
            const purgeBtn = frag.querySelector('.btn-bin-purge');
            const isPreviewingThis = previewingId === item.stateId;
            // 预览按钮: 未预览时可点(开预览); 正在预览这一项则高亮且可点=退出预览; 锁定(录制)时禁用
            previewBtn.disabled = !!(snap && snap.isRecording);
            previewBtn.classList.toggle('is-active', isPreviewingThis);
            previewBtn.title = isPreviewingThis ? '退出预览' : '只读预览: 把该状态叠加到节点查看 (不改当前选中)';
            previewBtn.addEventListener('click', () => {
                if (!this.currentCtrlUuid || (snap && snap.isRecording)) return;
                const msg = isPreviewingThis ? 'exit-preview' : 'preview-deleted-state';
                const payload = isPreviewingThis
                    ? { uuid: this.currentCtrlUuid }
                    : { uuid: this.currentCtrlUuid, stateId: item.stateId };
                this._callScene(msg, payload, () => this.refreshSnapshot());
            });
            // 恢复/彻底删除: 预览中也锁 (出口走横幅), 录制中也锁
            restoreBtn.disabled = locked;
            purgeBtn.disabled = locked;
            restoreBtn.addEventListener('click', () => {
                if (!this._binActionable()) return;
                this._callScene('restore-deleted-state', { uuid: this.currentCtrlUuid, stateId: item.stateId }, (err, ok) => {
                    if (err) Editor.warn(err);
                    if (!ok) Editor.warn('恢复失败');
                    this.refreshSnapshot();
                });
            });
            purgeBtn.addEventListener('click', () => {
                if (!this._binActionable()) return;
                this._confirm({
                    title: '彻底删除？',
                    body: `将彻底删除状态「${item.name || item.stateId}」(id ${item.stateId}) 的数据，<b>不可恢复</b>。`,
                    confirmLabel: '彻底删除',
                }, () => {
                    this._callScene('purge-deleted-state', { uuid: this.currentCtrlUuid, stateId: item.stateId }, (err) => {
                        if (err) Editor.warn(err);
                        this.refreshSnapshot();
                    });
                });
            });
            this.$binList.appendChild(frag);
        });
    },
    // 自定义确认弹窗: opts={title, body(html), confirmLabel}, onConfirm 在点确认时回调
    _confirm(opts, onConfirm) {
        this._confirmCb = onConfirm;
        this.$cmTitle.textContent = (opts && opts.title) || '确认';
        this.$cmBody.innerHTML = (opts && opts.body) || '';
        this.$cmConfirm.textContent = (opts && opts.confirmLabel) || '确认';
        this.$confirmModal.style.display = 'block';
    },
    _closeConfirm() {
        this._confirmCb = null;
        this.$confirmModal.style.display = 'none';
    },
    renderDetail() {
        const snap = this.currentSnapshot;
        const states = snap.states || [];
        const activeIndex = this._activeIndex(snap);
        const activeState = states.find(state => state.index === activeIndex);
        const name = activeState ? activeState.name : '--';
        const recording = !!snap.isRecording;
        const sel = this.$statePickSelect;
        sel.innerHTML = '';
        states.forEach(s => {
            const o = document.createElement('option');
            o.value = String(s.index);
            o.textContent = s.name || `#${s.index + 1}`;
            sel.appendChild(o);
        });
        if (states.length) sel.value = String(activeIndex);
        this.$stateTitle.textContent = name;
        this.$recordBadge.textContent = recording ? 'Recording' : 'Idle';
        this.$recordBadge.classList.toggle('is-live', recording);
        this.$btnStartRecord.style.display = recording ? 'none' : 'inline-flex';
        this.$btnStopRecord.style.display = recording ? 'inline-flex' : 'none';
        this.$btnCancelRecord.style.display = recording ? 'inline-flex' : 'none';
        // 预览中禁止开录 (开录会自动退出预览, UI 上直接锁更清晰)
        const previewing = this._previewingId(snap) >= 0;
        this.$btnStartRecord.disabled = previewing;
        this.$btnStartRecord.classList.toggle('is-disabled', previewing);
    },
    // 当前控制器在 topology 里的节点 (含 members/states/valueByState 真数据)
    _currentTopologyCtrl() {
        const ctrls = (this.topology && this.topology.controllers) || [];
        return ctrls.find(c => c.uuid === this.currentCtrlUuid) || null;
    },
    // 单控制器主区: 复用 topology 真数据, 按 member 铺 属性×状态 diff 矩阵
    renderEditorMatrix() {
        const host = this.$editorMatrix;
        if (!host) return;
        host.innerHTML = '';
        const ctrl = this._currentTopologyCtrl();
        if (!ctrl) {
            // topology 尚未到达; refreshTopology 回调会再次渲染
            if (!this.topology) this.refreshTopology();
            host.innerHTML = '<div class="prop-empty">正在加载受控属性…</div>';
            return;
        }
        // 选中状态以 snapshot 为权威 (避免 topology/snapshot selectedIndex 短暂错位高亮错列)
        const selIdx = this.currentSnapshot ? this.currentSnapshot.selectedIndex : ctrl.selectedIndex;
        // 默认只显示「存在跨状态变动」的属性; 勾选则显示全部已受控 (含各状态同值的)
        const showAll = !!(this.$chkShowAllProps && this.$chkShowAllProps.checked);
        const pick = showAll ? (p => this._propHasData(p)) : (p => p.variesAcrossStates);
        const members = (ctrl.members || [])
            .map(m => ({ m, props: (m.props || []).filter(pick) }))
            .filter(x => x.props.length);
        const hasAnyFollowed = (ctrl.members || []).some(m => (m.props || []).some(p => this._propHasData(p)));
        if (!members.length) {
            host.innerHTML = !hasAnyFollowed
                ? '<div class="prop-empty">该控制器还没有受控属性。点「🔴 录制」后在场景里改属性即可自动跟随。</div>'
                : '<div class="prop-empty">已跟随的属性在各状态值相同, 暂无跨状态变动。勾选上方「显示全部受控属性」可查看并取消跟随。</div>';
            return;
        }
        members.forEach(({ m: member, props }) => {
            const block = document.createElement('div');
            block.className = 'em-member';

            const title = document.createElement('div');
            title.className = 'em-member-title';
            title.textContent = `📦 ${member.nodeName || '(node)'}`;
            title.title = member.nodePath || '点击在场景中选中';
            title.addEventListener('click', () => { try { Editor.Selection.select('node', member.nodeUuid); } catch (e) { /* 静默 */ } });
            block.appendChild(title);

            const scroll = document.createElement('div');
            scroll.className = 'matrix-scroll em-scroll';
            const table = document.createElement('table');
            table.className = 'matrix-table';
            const thead = document.createElement('thead');
            const headTr = document.createElement('tr');
            thead.appendChild(headTr);
            const tbody = document.createElement('tbody');
            table.appendChild(thead);
            table.appendChild(tbody);
            scroll.appendChild(table);
            block.appendChild(scroll);

            this._buildMatrix(headTr, tbody, ctrl, props, {
                selectedIndex: selIdx,
                onCancel: (prop) => this._cancelFollow(prop, member),
            });
            host.appendChild(block);
        });
    },
    // 该 prop 是否真被某状态显式录过 (任一状态 valueByState 有非空值)
    _propHasData(prop) {
        const vbs = prop.valueByState;
        if (!vbs) return false;
        for (const k in vbs) { if (vbs[k] !== undefined && vbs[k] !== null) return true; }
        return false;
    },
    // 取消跟随: 对该 prop 的每个 leaf ref 调 remove-property (togglePropertyControl 接受 propRef 字符串)
    _cancelFollow(prop, member) {
        if (!this.currentCtrlUuid) return;
        const refs = (prop.refs && prop.refs.length) ? prop.refs : [prop.propRef];
        let pending = refs.length;
        refs.forEach(ref => {
            const payload = { ctrlUuid: this.currentCtrlUuid, propType: ref };
            payload[NODE_UUID_KEY] = member.nodeUuid;
            this._callScene('remove-property', payload, (err) => {
                if (err) Editor.warn(err);
                if (--pending === 0) { this.refreshTopology(); this.refreshSnapshot(); }
            });
        });
    },
    // 属性详情抽屉: 逐状态铺完整值 (大色块/资源全 id/向量分轴), 不截断
    _openPropDetail(ctrl, prop, selIdx) {
        this.$pdName.textContent = prop.display || '';
        this.$pdType.textContent = prop.compName || '';
        const sel = (selIdx !== undefined) ? selIdx : ctrl.selectedIndex;
        const body = this.$pdBody;
        body.innerHTML = '';
        (ctrl.states || []).forEach(state => {
            const row = document.createElement('div');
            row.className = 'pd-state';
            if (state.index === sel) row.classList.add('is-current');

            const label = document.createElement('div');
            label.className = 'pd-state-name';
            label.textContent = state.name || `#${state.index + 1}`;

            const valBox = document.createElement('div');
            valBox.className = 'pd-state-val';
            const explicit = prop.valueByState ? prop.valueByState[state.index] : undefined;
            const isGhost = explicit === undefined || explicit === null;
            const val = isGhost ? prop.defaultValue : explicit;
            const v = this._renderValue(val);
            if (v) { if (isGhost) v.classList.add('ghost-val'); valBox.appendChild(v); }
            else valBox.textContent = '—';
            if (isGhost) {
                const tag = document.createElement('span');
                tag.className = 'pd-ghost-tag';
                tag.textContent = '未录制 · 默认';
                valBox.appendChild(tag);
            }
            row.appendChild(label);
            row.appendChild(valBox);
            body.appendChild(row);
        });
        this.$propDetail.style.display = 'block';
    },
    _closePropDetail() { this.$propDetail.style.display = 'none'; },
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
        const sel = this.$ctrlSwitchSelect;
        const count = this.ctrlItems.length;
        sel.innerHTML = '';
        if (!count) {
            const o = document.createElement('option');
            o.textContent = '未连接';
            sel.appendChild(o);
        } else {
            this.ctrlItems.forEach(item => {
                const o = document.createElement('option');
                o.value = item.uuid;
                o.textContent = this._ctrlLabel(item);
                sel.appendChild(o);
            });
            if (this.currentCtrlUuid) sel.value = this.currentCtrlUuid;
        }
        this.$btnPrevCtrl.disabled = count <= 1;
        this.$btnNextCtrl.disabled = count <= 1;
    },

    // ============================================================
    // 主进程 / scene-script 广播
    // ============================================================
    messages: {
        'scene:reloaded'() { this.refreshTopology(); this.refreshBindings(); this.refreshCtrlList(); },
        'state-controller-v2-panel:scene-ready'() { this.refreshTopology(); this.refreshBindings(); this.refreshCtrlList(); },
        'state-controller-v2-panel:on-state-changed'(event, payload) {
            this.refreshTopology();
            this.refreshBindings();
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
        'state-controller-v2-panel:on-recording-changed'(event, payload) {
            this.refreshTopology();
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
        'state-controller-v2-panel:on-recording-cancelled'(event, payload) {
            this.refreshTopology();
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
        'state-controller-v2-panel:on-data-changed'(event, payload) {
            this.refreshTopology();
            this.refreshBindings();
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
    },
    _isActivePayload(payload) {
        if (!payload || !this.currentSnapshot) return true;
        return payload.ctrlId === this.currentSnapshot.ctrlId;
    },
};
