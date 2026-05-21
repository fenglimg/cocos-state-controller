'use strict';

/**
 * 逻辑交互控制
 * 负责绑定 UI 事件、与 scene-accessor 进行 IPC 通信
 */

module.exports = {
    $: {
        btnInstallCore: '#btn-install-core',
        statesList: '#states-list',
        btnAddState: '#btn-add-state',
        stateDetail: '#state-detail',
        emptyTip: '#empty-tip',
        ctrlList: '#ctrl-list',
        currentStateTitle: '#current-state-title',
        chkHomepage: '#chk-homepage',
        eventCount: '#event-count',
        btnToggleRecord: '#btn-toggle-record',
        selAddProp: '#sel-add-prop',
        btnAddProp: '#btn-add-prop',
        propsList: '#props-list',
        tplStateItem: '#tpl-state-item',
        tplPropItem: '#tpl-prop-item',
        tplCtrlItem: '#tpl-ctrl-item',
    },

    ready() {
        this.currentCtrlUuid = null;
        this.currentSnapshot = null;
        // 标记首次 (best-effort) 拉取: cocos 2.x panel ready 可能早于 scene-script 注册,
        // 第一次失败不报红, 等 scene:reloaded / setTimeout 兜底 / 用户操作触发重试.
        this._initialFetch = true;

        this._bindEvents();

        // 兜底: scene 已 ready 的场景下不会再触发 scene:reloaded, 延迟拉一次 (够 scene-script 注册).
        setTimeout(() => {
            if (!this.currentSnapshot && !this.$ctrlList.children.length) {
                this.refreshCtrlList();
            }
        }, 300);
    },

    close() {
        // panel close 时调 dispose-all-bridges 防泄漏
        this._callScene('dispose-all-bridges');
    },

    // 统一封装 panel → scene-accessor 的调用. cocos 2.x 通道是 callSceneScript,
    // 不是 sendToPanel('scene', ...). 后者无法路由到 scene-script.
    _callScene(method, payload, cb) {
        Editor.Scene.callSceneScript('state-controller-panel', method, payload, cb || function () {});
    },

    _bindEvents() {
        this.$btnInstallCore.addEventListener('click', () => {
            Editor.log('TODO Wave 3: 实装安装核心脚本命令');
        });

        // 添加状态
        this.$btnAddState.addEventListener('click', () => {
            if (!this.currentCtrlUuid || !this.currentSnapshot) return;
            const newName = `State_${this.currentSnapshot.states.length + 1}`;
            this._callScene('add-state', {
                uuid: this.currentCtrlUuid,
                name: newName,
            });
        });

        // 设为启动默认状态
        this.$chkHomepage.addEventListener('change', (e) => {
            if (!this.currentCtrlUuid || !this.currentSnapshot) return;
            const isChecked = e.target.checked;
            const stateId = isChecked ? this.currentSnapshot.selectedStateId : -1;
            this._callScene('set-home-page', {
                uuid: this.currentCtrlUuid,
                stateIdOrName: stateId,
            });
        });

        // 切换录制
        this.$btnToggleRecord.addEventListener('click', () => {
            if (!this.currentCtrlUuid || !this.currentSnapshot) return;
            const willRecord = !this.currentSnapshot.isRecording;
            this._callScene('set-recording', {
                uuid: this.currentCtrlUuid,
                isRecording: willRecord,
            });
        });

        // 添加属性
        this.$btnAddProp.addEventListener('click', () => {
            if (!this.currentCtrlUuid) return;
            const propType = this.$selAddProp.value;
            if (!propType) {
                Editor.warn('请先选择一个属性类型');
                return;
            }
            // 尝试获取当前选中的节点，否则降级使用 controller 节点
            const activeNodes = Editor.Selection.curSelection('node');
            const selectUuid = activeNodes.length > 0 ? activeNodes[0] : this.currentCtrlUuid;

            this._callScene('add-property', {
                ctrlUuid: this.currentCtrlUuid,
                selectUuid: selectUuid,
                propType: propType,
            });
        });
    },

    // 列出场景中的 StateController
    refreshCtrlList() {
        this._callScene('list-ctrls', null, (err, list) => {
            if (err) {
                // 首次 ready 期间 scene-script 可能还没注册, silent 让 scene:reloaded 重试;
                // 用户主动触发 (例如重选 ctrl) 时才报红.
                if (!this._initialFetch) {
                    Editor.error(err);
                }
                this._initialFetch = false;
                return;
            }
            this._initialFetch = false;
            this.$ctrlList.innerHTML = '';
            
            if (!list || list.length === 0) {
                this.setCurrentCtrl(null);
                return;
            }

            list.forEach(item => {
                const node = document.importNode(this.$tplCtrlItem.content, true);
                node.querySelector('.ctrl-name').textContent = item.ctrlName || `Controller (${item.ctrlId})`;
                const btn = node.querySelector('.btn-select-ctrl');
                btn.addEventListener('click', () => {
                    this.setCurrentCtrl(item.uuid);
                });
                this.$ctrlList.appendChild(node);
            });

            // 默认自动选中第一个
            if (!this.currentCtrlUuid) {
                this.setCurrentCtrl(list[0].uuid);
            }
        });
    },

    // 选中某个 Controller，拉取详情
    setCurrentCtrl(uuid) {
        this.currentCtrlUuid = uuid;
        if (!uuid) {
            this.$emptyTip.style.display = 'flex';
            this.$stateDetail.style.display = 'none';
            this.$statesList.innerHTML = '';
            return;
        }

        this.$emptyTip.style.display = 'none';
        this.$stateDetail.style.display = 'flex';
        this.refreshSnapshot();
    },

    // 重新拉取 Controller 快照数据
    refreshSnapshot() {
        if (!this.currentCtrlUuid) return;

        this._callScene('get-ctrl-snapshot', {
            uuid: this.currentCtrlUuid,
        }, (err, snapshot) => {
            if (err) {
                Editor.warn('未能获取 controller 快照: ', err);
                this.setCurrentCtrl(null);
                return;
            }
            this.currentSnapshot = snapshot;
            this.renderUI();
        });
    },

    // 渲染 UI (将 snapshot 绑定到 DOM)
    renderUI() {
        if (!this.currentSnapshot) return;
        const snap = this.currentSnapshot;

        // --- 1. 左侧 States 列表 ---
        this.$statesList.innerHTML = '';
        const selectedState = snap.states.find(s => s.index === snap.selectedIndex);
        const selectedStateName = selectedState ? selectedState.name : 'Unknown';

        snap.states.forEach(state => {
            const node = document.importNode(this.$tplStateItem.content, true);
            const itemDiv = node.querySelector('.state-item');
            
            node.querySelector('.state-name').textContent = state.name;
            
            if (state.index === snap.selectedIndex) {
                itemDiv.classList.add('active');
                if (snap.isRecording) {
                    node.querySelector('.record-indicator').style.display = 'inline';
                }
            }

            // 点击切换 state
            itemDiv.addEventListener('click', (e) => {
                if (e.target.closest('.btn')) return; // 忽略按钮点击
                if (state.index === snap.selectedIndex) return; // 已经是当前状态
                this._callScene('set-selected-index', {
                    uuid: this.currentCtrlUuid,
                    index: state.index,
                });
            });

            // 删 state
            const delBtn = node.querySelector('.btn-del-state');
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止冒泡触发 click state
                this._callScene('remove-state', {
                    uuid: this.currentCtrlUuid,
                    index: state.index,
                });
            });

            this.$statesList.appendChild(node);
        });

        // --- 2. 右侧当前 State 详情 ---
        this.$currentStateTitle.textContent = `Current State: "${selectedStateName}" 详情`;
        this.$chkHomepage.checked = (snap.homePageStateId === snap.selectedStateId);
        
        // 录制按钮状态
        if (snap.isRecording) {
            this.$btnToggleRecord.textContent = '[ON]';
            this.$btnToggleRecord.classList.remove('off');
            this.$btnToggleRecord.classList.add('on');
        } else {
            this.$btnToggleRecord.textContent = '[OFF]';
            this.$btnToggleRecord.classList.remove('on');
            this.$btnToggleRecord.classList.add('off');
        }

        // --- 3. 属性列表 ---
        this.$propsList.innerHTML = '';
        // 占位逻辑：目前 getCtrlSnapshot 未明确定义 props 数组，为了兼容性我们暂时防御性处理
        // TODO: Wave 3 后期需要将 scene-accessor 中的 snap 加入 props 数组
        if (snap.props && Array.isArray(snap.props)) {
            snap.props.forEach(prop => {
                const node = document.importNode(this.$tplPropItem.content, true);
                node.querySelector('.prop-name').textContent = prop.name || prop;
                this.$propsList.appendChild(node);
            });
        }
    },

    // IPC 接收，处理由 scene-accessor 广播过来的事件
    messages: {
        // cocos 2.x scene 加载完会广播这条 — 此时 scene-script 已注册, 重新拉 ctrl 列表.
        // 关键: 修复 panel ready 早于 scene-script 注册的时序问题.
        'scene:reloaded'() {
            this.refreshCtrlList();
        },
        'state-controller-panel:on-state-changed'(event, payload) {
            if (this.currentSnapshot && payload && payload.ctrlId === this.currentSnapshot.ctrlId) {
                this.refreshSnapshot();
            }
        },
        'state-controller-panel:on-recording-changed'(event, payload) {
            if (this.currentSnapshot && payload && payload.ctrlId === this.currentSnapshot.ctrlId) {
                this.refreshSnapshot();
            }
        },
        'state-controller-panel:on-data-changed'(event, payload) {
            if (this.currentSnapshot && payload && payload.ctrlId === this.currentSnapshot.ctrlId) {
                this.refreshSnapshot();
            }
        },
        // 监听编辑器选中节点变化，尝试自动关联
        'selection:selected'(event, type) {
            if (type === 'node') {
                const activeNodes = Editor.Selection.curSelection('node');
                if (activeNodes.length > 0) {
                    // 只检查但不一定直接绑定，如果希望用户点选中则仅刷新
                    // this.refreshCtrlList();
                }
            }
        }
    }
};
