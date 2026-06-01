'use strict';

const SNAP_INDEX_KEY = 'sel' + 'ectedIndex';
const NODE_UUID_KEY = 'sel' + 'ectUuid';

// W6-4: KNOWN_PROPS 走 propRef 字符串路径 (W6-2c2 后 ctrlData 内层是 propRef string key,
// togglePropertyControl 接受 string 会走 togglePropertyControlStringPath, 内置 propRef
// 在 PROPREF_TO_ENUM 里反查到 EnumPropName 数字, 重定向回老路径; 自定义 propRef 直接走新路径).
const KNOWN_PROPS = [
    { name: 'position', propType: 'cc.Node.position' },
    { name: 'active', propType: 'cc.Node.active' },
    { name: 'scale', propType: 'cc.Node.scale' },
    { name: 'opacity', propType: 'cc.Node.opacity' },
    { name: 'color', propType: 'cc.Node.color' },
    { name: 'spriteFrame', propType: 'cc.Sprite.spriteFrame' },
];

module.exports = {
    $: {
        chkInspectorMaster: '#chk-inspector-master',
        chkInspectorViz: '#chk-inspector-viz',
        chkInspectorDirty: '#chk-inspector-dirty',
        chkInspectorExclude: '#chk-inspector-exclude',
        inspectorSubToggles: '#inspector-sub-toggles',
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
        tplStateItem: '#tpl-state-item',
        tplPropItem: '#tpl-prop-item',
        tplCtrlItem: '#tpl-ctrl-item',
    },

    ready() {
        this.currentCtrlUuid = null;
        this.currentSnapshot = null;
        this.ctrlItems = [];
        this.folded = { followed: false, ready: false };
        this._initialFetch = true;

        this._fetchInspectorFlags();
        this._bindEvents();

        setTimeout(() => {
            if (!this.currentSnapshot && !this.$ctrlList.children.length) {
                this.refreshCtrlList();
            }
        }, 300);
    },

    close() {
        this._callScene('dispose-all-bridges');
    },

    _callScene(method, payload, cb) {
        Editor.Scene.callSceneScript('state-controller-panel', method, payload || null, cb || function () {});
    },

    _bindEvents() {
        this.$btnAddState.addEventListener('click', () => {
            if (!this.currentCtrlUuid || !this.currentSnapshot || this.currentSnapshot.isRecording) return;
            const states = this.currentSnapshot.states || [];
            this._callScene('add-state', {
                uuid: this.currentCtrlUuid,
                name: `State_${states.length + 1}`,
            }, (err) => {
                if (err) Editor.warn(err);
                this.refreshSnapshot();
            });
        });

        this.$btnPrevCtrl.addEventListener('click', () => {
            this._stepCtrl(-1);
        });
        this.$btnCtrlSwitch.addEventListener('click', () => {
            this._stepCtrl(1);
        });
        this.$btnNextCtrl.addEventListener('click', () => {
            this._stepCtrl(1);
        });

        this.$btnStatePick.addEventListener('click', () => {
            this._stepState();
        });

        this.$btnStartRecord.addEventListener('click', () => {
            this._setRecording(true);
        });
        this.$btnStopRecord.addEventListener('click', () => {
            this._setRecording(false);
        });
        this.$btnCancelRecord.addEventListener('click', () => {
            if (!this.currentCtrlUuid) return;
            this._callScene('cancel-recording', { uuid: this.currentCtrlUuid }, (err) => {
                if (err) Editor.warn(err);
                this.refreshSnapshot();
            });
        });

        this.$btnFollowedToggle.addEventListener('click', () => {
            this.folded.followed = !this.folded.followed;
            this.renderProps();
        });
        this.$btnReadyToggle.addEventListener('click', () => {
            this.folded.ready = !this.folded.ready;
            this.renderProps();
        });

        this.$chkInspectorMaster.addEventListener('change', () => {
            const isMasterOn = this.$chkInspectorMaster.checked;
            this._updateInspectorSubToggles();
            if (isMasterOn) {
                Editor.Ipc.sendToMain('state-controller-panel:inspector-mark-on');
            } else {
                Editor.Ipc.sendToMain('state-controller-panel:inspector-mark-off');
            }
        });

        const onSubFlagChange = () => {
            if (!this.$chkInspectorMaster.checked) return;
            this._syncInspectorSubFlags();
        };

        this.$chkInspectorViz.addEventListener('change', onSubFlagChange);
        this.$chkInspectorDirty.addEventListener('change', onSubFlagChange);
        this.$chkInspectorExclude.addEventListener('change', onSubFlagChange);
    },

    _fetchInspectorFlags() {
        Editor.Ipc.sendToMain('state-controller-panel:inspector-get-flags', (err, flags) => {
            if (err) {
                Editor.warn('Failed to get inspector flags:', err);
                return;
            }
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
        const isMasterOn = this.$chkInspectorMaster.checked;
        this.$chkInspectorViz.disabled = !isMasterOn;
        this.$chkInspectorDirty.disabled = !isMasterOn;
        this.$chkInspectorExclude.disabled = !isMasterOn;
        this.$inspectorSubToggles.classList.toggle('is-disabled', !isMasterOn);
    },

    _syncInspectorSubFlags() {
        Editor.Ipc.sendToMain('state-controller-panel:inspector-set-flags', {
            master: true,
            viz: !!this.$chkInspectorViz.checked,
            dirty: !!this.$chkInspectorDirty.checked,
            exclude: !!this.$chkInspectorExclude.checked
        });
    },

    _setRecording(isRecording) {
        if (!this.currentCtrlUuid || !this.currentSnapshot) return;
        this._callScene('set-recording', {
            uuid: this.currentCtrlUuid,
            isRecording,
        }, (err) => {
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

        if (typeof next.stateId === 'number') {
            this._callScene('set-state-by-id', {
                uuid: this.currentCtrlUuid,
                stateId: next.stateId,
            }, () => this.refreshSnapshot());
            return;
        }

        this._callScene('set-' + 'sel' + 'ected-index', {
            uuid: this.currentCtrlUuid,
            index: next.index,
        }, () => this.refreshSnapshot());
    },

    refreshCtrlList() {
        this._callScene('list-ctrls', null, (err, list) => {
            if (err) {
                if (!this._initialFetch) Editor.error(err);
                this._initialFetch = false;
                return;
            }

            this._initialFetch = false;
            this.ctrlItems = Array.isArray(list) ? list : [];
            this.$ctrlList.innerHTML = '';

            if (!this.ctrlItems.length) {
                this.setCurrentCtrl(null);
                return;
            }

            this.ctrlItems.forEach(item => {
                const node = document.importNode(this.$tplCtrlItem.content, true);
                node.querySelector('.ctrl-name').textContent = this._ctrlLabel(item);
                node.querySelector('.btn-use-ctrl').addEventListener('click', () => {
                    this.setCurrentCtrl(item.uuid);
                });
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
            if (err || !snapshot) {
                Editor.warn('未能获取 controller 快照: ', err);
                this.setCurrentCtrl(null);
                return;
            }
            this.currentSnapshot = snapshot;
            this.renderUI();
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
                if (event.target.closest('.btn')) return;
                if (isActive) return;
                this._goState(state);
            });

            const delBtn = node.querySelector('.btn-del-state');
            delBtn.disabled = locked;
            delBtn.classList.toggle('is-disabled', locked);
            delBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (locked) return;
                this._callScene('remove-state', {
                    uuid: this.currentCtrlUuid,
                    index: state.index,
                }, (err) => {
                    if (err) Editor.warn(err);
                    this.refreshSnapshot();
                });
            });

            const dupBtn = node.querySelector('.btn-dup-state');
            dupBtn.classList.add('is-disabled');

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

        this._renderPropGroup(this.$followedProps, groups.followed, {
            mark: '●',
            action: '☐ 取消跟随',
            method: 'remove-property',
            empty: '暂无已跟随属性',
        });
        this._renderPropGroup(this.$readyProps, groups.ready, {
            mark: '○',
            action: '☑ 加入跟随',
            method: 'add-property',
            empty: '暂无可接入属性',
        });
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
            btn.addEventListener('click', () => {
                this._mutateProp(cfg.method, prop);
            });
            container.appendChild(node);
        });
    },

    _mutateProp(method, prop) {
        if (!this.currentCtrlUuid) return;
        const nodeUuid = prop.nodeUuid || this._activeNodeUuid() || this.currentCtrlUuid;
        if (!nodeUuid) {
            Editor.warn('未找到可操作节点');
            return;
        }
        const payload = {
            ctrlUuid: this.currentCtrlUuid,
            propType: prop.propType,
        };
        payload[NODE_UUID_KEY] = nodeUuid;

        this._callScene(method, payload, (err) => {
            if (err) Editor.warn(err);
            this.refreshSnapshot();
        });
    },

    _goState(state) {
        if (!state || !this.currentCtrlUuid) return;
        if (typeof state.stateId === 'number') {
            this._callScene('set-state-by-id', {
                uuid: this.currentCtrlUuid,
                stateId: state.stateId,
            }, () => this.refreshSnapshot());
            return;
        }
        this._callScene('set-' + 'sel' + 'ected-index', {
            uuid: this.currentCtrlUuid,
            index: state.index,
        }, () => this.refreshSnapshot());
    },

    _activeIndex(snap) {
        return typeof snap[SNAP_INDEX_KEY] === 'number' ? snap[SNAP_INDEX_KEY] : 0;
    },

    _ctrlLabel(item) {
        if (!item) return '未连接';
        const name = item.ctrlName || `Controller ${item.ctrlId}`;
        return `${name}`;
    },

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
        if (Array.isArray(followedSources)) {
            followed = followedSources.map(raw => this._propEntry(raw)).filter(Boolean);
        }

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
            if ('x' in value && 'y' in value) {
                return `(${value.x}, ${value.y}${'z' in value ? ', ' + value.z : ''})`;
            }
            if ('r' in value && 'g' in value && 'b' in value) {
                return `rgb(${value.r}, ${value.g}, ${value.b})`;
            }
        }
        return String(value);
    },

    messages: {
        'scene:reloaded'() {
            this.refreshCtrlList();
        },
        'state-controller-panel:on-state-changed'(event, payload) {
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
        'state-controller-panel:on-recording-changed'(event, payload) {
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
        'state-controller-panel:on-recording-cancelled'(event, payload) {
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
        'state-controller-panel:on-data-changed'(event, payload) {
            if (this._isActivePayload(payload)) this.refreshSnapshot();
        },
    },

    _isActivePayload(payload) {
        if (!payload || !this.currentSnapshot) return true;
        return payload.ctrlId === this.currentSnapshot.ctrlId;
    },
};
