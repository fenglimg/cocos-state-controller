/**
 * state-controller-v2-panel — Pure IPC handler 层.
 *
 * 所有面板操作的纯函数实现, 不依赖 Cocos Editor 全局.
 * 接收 ctrl 实例 (+ 必要时 select 实例) 与参数, 返回结果.
 *
 * scene-accessor.js 上层负责:
 *   - 通过 uuid 把 message 路由到对应 ctrl/select 实例
 *   - 包 event.reply 回包
 *   - 把 installBroadcastBridge 的 send 接到 Editor.Ipc.sendToPanel
 *
 * 设计原则:
 *   - 所有读写都走 ctrl/select 实例的 field/setter, 不依赖 plugin 侧 require 项目源
 *   - capability 本体在 game runtime 里通过 ctrl 加载时自注册 + selectedIndex.setter
 *     自动联动 (录制 / 事件 / tween 等), plugin 侧不重复维护一份
 *   - 唯一例外: installBroadcastBridge 要监听 game runtime 内 state 切换, 需要
 *     EventCapability 单例. 它仅在 jest (node CommonJS) 路径下可达; cocos 编辑器
 *     scene-script 上下文里 require 项目源会抛, 此时降级到 noop bridge —— panel
 *     操作触发的刷新走 scene-accessor.js 主动 broadcast 路径, 用户在编辑器外手改
 *     ctrl 时需手动重选 ctrl. (具体见 feedback memory: editor-e2e-required)
 *   - 错误兜底: ctrl 为 null/undefined 不抛, 返回安全值
 */

'use strict';

// 项目源 require — 仅 jest 路径用得到, cocos 编辑器侧 try 失败也无害.
let _CapabilityRegistry = null;
try {
    // 逐个 require 内置 capability 触发 side-effect 自注册 (原 capabilities/index barrel 已删:
    // cocos 2.x 构建会无条件包含 assets 下所有脚本, barrel 仅 jest/此处显式加载需要).
    require('../../../assets/script/controller/capabilities/AutoSyncCapability');
    require('../../../assets/script/controller/capabilities/EventCapability');
    require('../../../assets/script/controller/capabilities/MigrationCapability');
    require('../../../assets/script/controller/capabilities/MultiCtrlBindingCapability');
    require('../../../assets/script/controller/capabilities/PropertyControlCapability');
    require('../../../assets/script/controller/capabilities/RecordingCapability');
    require('../../../assets/script/controller/capabilities/SelectedPageIdCapability');
    _CapabilityRegistry = require('../../../assets/script/controller/CapabilityRegistry').CapabilityRegistry;
} catch (_) {
    // cocos editor scene-script 上下文 — 项目 ts 源不可达, installBroadcastBridge 降级
}

function safeCtrlId(ctrl) {
    return (ctrl && typeof ctrl.ctrlId === 'number') ? ctrl.ctrlId : -1;
}

function findIndexByStateId(ctrl, stateId) {
    const states = ctrl && ctrl._states;
    if (!states) return -1;
    for (let i = 0; i < states.length; i++) {
        const s = states[i];
        if (s && s.stateId === stateId) return i;
    }
    return -1;
}

function listAllStates(ctrl) {
    const out = [];
    if (!ctrl || !ctrl._states) return out;
    for (let i = 0; i < ctrl._states.length; i++) {
        const s = ctrl._states[i];
        if (!s) continue;
        out.push({ index: i, stateId: s.stateId, name: s.name });
    }
    return out;
}

/**
 * 完整快照, 供 Panel 渲染. 一次性读取避免多次 IPC round-trip.
 */
function getCtrlSnapshot(ctrl) {
    if (!ctrl) return null;
    const states = listAllStates(ctrl);
    const idx = ctrl.selectedIndex;
    const sel = states[idx];
    return {
        ctrlId: ctrl.ctrlId,
        ctrlName: ctrl.ctrlName || '',
        selectedIndex: idx,
        selectedStateId: sel ? sel.stateId : -1,
        isRecording: !!ctrl.isRecording,
        states: states,
        deletedStates: listDeletedStates(ctrl),
        previewingStateId: (typeof ctrl.previewingStateId === 'number') ? ctrl.previewingStateId : -1,
    };
}

function setSelectedIndex(ctrl, index) {
    if (!ctrl) return false;
    if (typeof index !== 'number') return false;
    if (!ctrl._states || index < 0 || index >= ctrl._states.length) return false;
    ctrl.selectedIndex = index;
    return true;
}

function setStateById(ctrl, stateId) {
    if (!ctrl) return false;
    const idx = findIndexByStateId(ctrl, stateId);
    if (idx < 0) return false;
    ctrl.selectedIndex = idx;
    return true;
}

function setRecording(ctrl, isRecording) {
    if (!ctrl) return false;
    if (isRecording) {
        if (typeof ctrl.startRecording === 'function') ctrl.startRecording();
    } else if (typeof ctrl.stopRecording === 'function') ctrl.stopRecording();
    return true;
}

/**
 * 撤销本次录制 (TASK-002): 调 ctrl.cancelRecording, ctrlData 回滚到录制开始前.
 * 非录制态调是 no-op (ctrl 端幂等).
 */
function cancelRecording(ctrl) {
    if (!ctrl) return false;
    if (typeof ctrl.cancelRecording === 'function') ctrl.cancelRecording();
    return true;
}

/**
 * 新增 state. 走 StateControllerV2.states setter (复用 smart-name + stateId 分配逻辑).
 * 返回新 stateId, 失败返回 -1.
 *
 * 不 require StateControllerV2 源: 用现有 state 的 constructor 当工厂.
 */
function addState(ctrl, name) {
    if (!ctrl || !ctrl._states) return -1;
    const protoState = ctrl._states[0];
    if (!protoState || typeof protoState.constructor !== 'function') return -1;
    const StateValue = protoState.constructor;
    if (typeof StateValue.create !== 'function') return -1;

    const beforeIds = Object.create(null);
    for (let i = 0; i < ctrl._states.length; i++) {
        beforeIds[ctrl._states[i].stateId] = true;
    }
    const newState = StateValue.create(name || ('S' + ctrl._states.length), ctrl.stateIdAuto++);
    const newStates = ctrl._states.slice();
    newStates.push(newState);
    ctrl.states = newStates;

    // setter 内部可能改写 newState 引用; 用 id diff 找到新加入的 stateId
    let newId = -1;
    for (let i = 0; i < ctrl._states.length; i++) {
        if (!beforeIds[ctrl._states[i].stateId]) {
            newId = ctrl._states[i].stateId;
            break;
        }
    }
    return newId;
}

/**
 * 删除指定 index 的 state. 至少保留 1 个 (与 removeSelectedState 一致).
 */
function removeState(ctrl, index) {
    if (!ctrl || !ctrl._states) return false;
    if (typeof index !== 'number' || index < 0 || index >= ctrl._states.length) return false;
    if (ctrl._states.length <= 1) return false;

    const newStates = ctrl._states.slice();
    newStates.splice(index, 1);
    const beforeLen = ctrl._states.length;
    ctrl.states = newStates;
    return ctrl._states.length === beforeLen - 1;
}

function restoreLastDeletedState(ctrl) {
    if (!ctrl || typeof ctrl.restoreLastDeletedState !== 'function') return false;
    return !!ctrl.restoreLastDeletedState();
}

/** 回收站: 列出暂存的已删除 state [{name, stateId}]. */
function listDeletedStates(ctrl) {
    if (!ctrl || typeof ctrl.listDeletedStates !== 'function') return [];
    const list = ctrl.listDeletedStates();
    return Array.isArray(list) ? list : [];
}

/** 回收站: 恢复指定 stateId 的暂存 state (追加到尾部, 数据自动接回). */
function restoreDeletedState(ctrl, stateId) {
    if (!ctrl || typeof ctrl.restoreDeletedState !== 'function') return false;
    return !!ctrl.restoreDeletedState(stateId);
}

/** 回收站硬删: 彻底删除指定 stateId 的页数据 (不可恢复). */
function purgeDeletedState(ctrl, stateId) {
    if (!ctrl || typeof ctrl.purgeDeletedState !== 'function') return false;
    return !!ctrl.purgeDeletedState(stateId);
}

/** 回收站: 清空 (对所有暂存项硬删, 不可恢复). */
function purgeAllDeletedStates(ctrl) {
    if (!ctrl || typeof ctrl.purgeAllDeletedStates !== 'function') return false;
    return !!ctrl.purgeAllDeletedStates();
}

/** 回收站: 进入某 stateId 的只读预览 (叠加到节点, 不改选中). */
function previewDeletedState(ctrl, stateId) {
    if (!ctrl || typeof ctrl.previewDeletedState !== 'function') return false;
    return !!ctrl.previewDeletedState(stateId);
}

/** 回收站: 退出预览 (按快照还原节点). */
function exitPreview(ctrl) {
    if (!ctrl || typeof ctrl.exitPreview !== 'function') return false;
    return !!ctrl.exitPreview();
}

/**
 * 手动添加 prop (panel "+ 添加属性" 按钮).
 * 调 StateSelectV2.togglePropertyControl, 触发 PropertyControlService 写入 _ctrlData.
 */
function addProperty(ctrl, select, propType) {
    if (!ctrl || !select) return false;
    if (typeof select.togglePropertyControl !== 'function') return false;
    // propType 可能是 EnumPropName 数字, 也可能是字符串 ("position"); 这里只透传
    select.togglePropertyControl(propType, true);
    return true;
}

/**
 * 移除 prop (TASK-003 panel "☐ 取消跟随" 按钮).
 * 调 StateSelectV2.togglePropertyControl(false), 取消跟随 + 清 propData 中对应字段.
 */
function removeProperty(ctrl, select, propType) {
    if (!ctrl || !select) return false;
    if (typeof select.togglePropertyControl !== 'function') return false;
    select.togglePropertyControl(propType, false);
    return true;
}

/**
 * M1-1: 把一个存储值 (primitive 或 cc 类型) 序列化成 JSON-friendly 可显示形式.
 *
 * 不 require 项目源 (editor scene-script 路径不可达), 用 duck-type 识别 cc 类型:
 *   primitive (number/boolean/string) 原样; null/undefined → null;
 *   cc.Color {r,g,b,a} / cc.Vec3 {x,y,z} / cc.Vec2 {x,y} / cc.Size {width,height} /
 *   cc.Quat {x,y,z,w} → 带 _t 标签的纯对象; asset ({_uuid}|{name}) → {_t:'Asset', id}.
 */
function serializeStateValue(v) {
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t === 'number' || t === 'boolean' || t === 'string') return v;
    if (t !== 'object') return null;
    const num = function (x) { return typeof x === 'number'; };
    if (num(v.r) && num(v.g) && num(v.b)) {
        return { _t: 'Color', r: v.r, g: v.g, b: v.b, a: num(v.a) ? v.a : 255 };
    }
    if (num(v.width) && num(v.height)) return { _t: 'Size', width: v.width, height: v.height };
    if (num(v.x) && num(v.y) && num(v.z) && num(v.w)) return { _t: 'Quat', x: v.x, y: v.y, z: v.z, w: v.w };
    if (num(v.x) && num(v.y) && num(v.z)) return { _t: 'Vec3', x: v.x, y: v.y, z: v.z };
    if (num(v.x) && num(v.y)) return { _t: 'Vec2', x: v.x, y: v.y };
    if (v._uuid || v.name) return { _t: 'Asset', id: v._uuid || v.name };
    return null;
}

/**
 * M1-1: 读 select._ctrlData[currCtrlId] 里每个受控 propRef 在各 state 的存储值,
 * 判定「是否跨状态有差异」并返回各状态值表 — 供注入侧标 ● + hover 各状态值.
 *
 * 数据形状 (W6-2c2 后): pageData = _ctrlData[ctrlId], key = '$$default$$' | stateIndex(number);
 *   每个 propData 里 string propRef key → 存储值 (number/boolean/cc 类型);
 *   '$$' 前缀 key ($$controlledProps$$ 等) 与 legacy number-only key 跳过.
 *
 * variesAcrossStates: 各 state 的已定义值序列化后存在 ≥2 个不同 → true (真正受状态机驱动).
 *
 * @param select - StateSelectV2 实例 (读 _ctrlData / _ctrlsMap / currCtrlId)
 * @param ctrl   - 可选 StateControllerV2; 不传则从 select._ctrlsMap[currCtrlId] 推导
 * @returns { ok, hasSelect, states:[{index,stateId,name}], props:{ [propRef]:{ variesAcrossStates, valueByState, defaultValue } } }
 */
function getPropStateValues(select, ctrl) {
    const empty = { ok: true, hasSelect: false, states: [], props: {} };
    if (!select) return empty;
    const c = ctrl || (select._ctrlsMap && select._ctrlsMap[select.currCtrlId]) || null;
    const ctrlId = (c && c.ctrlId != null) ? c.ctrlId
        : (select.currCtrlId != null ? select.currCtrlId : null);
    const data = select._ctrlData || {};
    const pageData = (ctrlId != null && data[ctrlId]) ? data[ctrlId] : null;
    const states = listAllStates(c);
    const selectedIndex = (c && typeof c.selectedIndex === 'number') ? c.selectedIndex : -1;
    const result = { ok: true, hasSelect: true, states: states, selectedIndex: selectedIndex, props: {} };
    if (!pageData) return result;

    function valueKeys(pd, sink) {
        if (!pd) return;
        for (const k in pd) {
            if (k.indexOf('$$') === 0) continue;       // 内部 key
            if (/^\d+$/.test(k)) continue;             // legacy number-only key (string twin 优先)
            sink[k] = 1;
        }
    }
    function pageOf(state) {
        if (!state) return null;
        if (pageData[state.stateId] != null) return pageData[state.stateId];
        return pageData[state.index] != null ? pageData[state.index] : null;
    }

    // 收集所有受控 propRef (default + 各 state 的值 key 并集)
    const refSet = {};
    valueKeys(pageData.$$default$$, refSet);
    for (let i = 0; i < states.length; i++) valueKeys(pageOf(states[i]), refSet);

    for (const ref in refSet) {
        const valueByState = {};
        const distinct = {};
        let definedCount = 0;
        for (let i = 0; i < states.length; i++) {
            const state = states[i];
            const pd = pageOf(state);
            const raw = pd ? pd[ref] : undefined;
            const ser = serializeStateValue(raw);
            valueByState[state.stateId] = ser;
            if (raw !== undefined) {
                definedCount++;
                distinct[JSON.stringify(ser)] = 1;
            }
        }
        const defRaw = pageData.$$default$$ ? pageData.$$default$$[ref] : undefined;
        const defSer = serializeStateValue(defRaw);
        // M1-3: 当前 state 下值是否覆盖 default (两者均有定义且序列化后不等)
        let overriddenAtCurrent = false;
        if (selectedIndex >= 0 && defRaw !== undefined) {
            const curPd = pageOf(states[selectedIndex]);
            const curRaw = curPd ? curPd[ref] : undefined;
            if (curRaw !== undefined) {
                overriddenAtCurrent = JSON.stringify(serializeStateValue(curRaw)) !== JSON.stringify(defSer);
            }
        }
        result.props[ref] = {
            variesAcrossStates: definedCount >= 2 && Object.keys(distinct).length >= 2,
            overriddenAtCurrent: overriddenAtCurrent,
            valueByState: valueByState,
            defaultValue: defSer,
        };
    }
    return result;
}

/**
 * 把 ctrl 内部 state 切换 + setRecording 转成 IPC broadcast.
 *
 * jest 路径: 通过 EventCapability + ad-hoc capability 注册. 测试覆盖.
 * cocos 编辑器路径: _CapabilityRegistry 为 null → noop. panel 触发的操作走
 *   scene-accessor.js 主动 broadcast 'on-data-changed' 自刷新.
 *
 * @param ctrl - 目标 controller
 * @param send - (eventName, payload) => void, 上层接 Editor.Ipc.sendToPanel
 * @returns unsubscribe() 卸载所有 listener
 */
function installBroadcastBridge(ctrl, send) {
    if (!ctrl || typeof send !== 'function') return function () {};
    if (!_CapabilityRegistry) return function () {};

    const event = _CapabilityRegistry.get('event');
    if (!event) return function () {};

    const stateChangedCb = function (payload) {
        send('onStateChanged', {
            ctrlId: payload.ctrl ? payload.ctrl.ctrlId : safeCtrlId(ctrl),
            fromState: payload.fromState,
            toState: payload.toState,
            fromName: payload.fromName,
            toName: payload.toName,
        });
    };
    event.on(ctrl, 'stateChanged', stateChangedCb);

    const recBridgeName = '_panelRecordingBridge_' + ctrl.ctrlId;
    const recBridge = {
        name: recBridgeName,
        onRecordingStart: function (ctx) {
            if (ctx.ctrl === ctrl) send('onRecordingChanged', { ctrlId: safeCtrlId(ctrl), isRecording: true });
        },
        onRecordingStop: function (ctx) {
            if (ctx.ctrl === ctrl) send('onRecordingChanged', { ctrlId: safeCtrlId(ctrl), isRecording: false });
        },
        // TASK-002: cancelRecording 也广播 onRecordingChanged → isRecording=false,
        // 同时单独广播 onRecordingCancelled 让 panel 区分 "停止" 与 "撤销" (撤销需要刷数据)
        onRecordingCancel: function (ctx) {
            if (ctx.ctrl === ctrl) {
                send('onRecordingChanged', { ctrlId: safeCtrlId(ctrl), isRecording: false });
                send('onRecordingCancelled', { ctrlId: safeCtrlId(ctrl), fromState: ctx.fromState });
            }
        },
    };
    _CapabilityRegistry.register(recBridge);

    return function unsubscribe() {
        event.off(ctrl, 'stateChanged', stateChangedCb);
        _CapabilityRegistry.unregister(recBridgeName);
    };
}

/**
 * 聚合场景拓扑树
 * @param {Array} ctrlsInfo [{ uuid, ctrl }]
 * @param {Array} selectsInfo [{ nodeUuid, nodeName, nodePath, select, getRowsInfo }]
 * @returns 拓扑树对象
 */
function buildTopology(ctrlsInfo, selectsInfo) {
    const topology = { controllers: [] };
    if (!ctrlsInfo) return topology;

    for (let i = 0; i < ctrlsInfo.length; i++) {
        const cInfo = ctrlsInfo[i];
        const ctrl = cInfo.ctrl;
        if (!ctrl) continue;

        const snap = getCtrlSnapshot(ctrl);
        if (!snap) continue;

        const cNode = {
            uuid: cInfo.uuid,
            ctrlId: ctrl.ctrlId,
            ctrlName: snap.ctrlName,
            states: snap.states,
            selectedIndex: snap.selectedIndex,
            isRecording: snap.isRecording,
            // 支柱 B: 该控制器的跨控制器联动声明 [{sourceStateId,targetCtrlId,targetStateId}].
            bindings: (ctrl && typeof ctrl.getBindings === 'function') ? ctrl.getBindings() : [],
            members: []
        };

        for (let j = 0; j < selectsInfo.length; j++) {
            const sInfo = selectsInfo[j];
            const select = sInfo.select;
            if (!select || !select._ctrlsMap) continue;

            // 成员节点是否接入了这个 controller
            if (select._ctrlsMap[ctrl.ctrlId]) {
                const sv = getPropStateValues(select, ctrl);
                const rowsInfo = sInfo.getRowsInfo ? sInfo.getRowsInfo() : [];
                const props = [];

                for (let r = 0; r < rowsInfo.length; r++) {
                    const row = rowsInfo[r];
                    const refs = row.refs || [];
                    const kind = row.kind;
                    
                    let varies = false, override = false, hasData = false;
                    const combinedValueByState = {};
                    let combinedDefault = undefined;

                    if (refs.length === 1) {
                        const p = sv.props && sv.props[refs[0]];
                        if (p) {
                            combinedDefault = p.defaultValue;
                            if (sv.states) {
                                for(let s = 0; s < sv.states.length; s++) {
                                    const sId = sv.states[s].stateId;
                                    combinedValueByState[sId] = p.valueByState ? p.valueByState[sId] : undefined;
                                }
                            }
                        }
                        if (p) {
                            hasData = true;
                            if (p.variesAcrossStates) varies = true;
                            if (p.overriddenAtCurrent) override = true;
                        }
                    } else if (refs.length > 1) {
                        combinedDefault = {};
                        for (let k = 0; k < refs.length; k++) {
                            const ref = refs[k];
                            const p = sv.props && sv.props[ref];
                            const refName = ref.split('.').pop();
                            combinedDefault[refName] = p ? p.defaultValue : undefined;
                            
                            if (sv.states) {
                                for(let s = 0; s < sv.states.length; s++) {
                                    const sId = sv.states[s].stateId;
                                    if (!combinedValueByState[sId]) combinedValueByState[sId] = {};
                                    combinedValueByState[sId][refName] = p && p.valueByState ? p.valueByState[sId] : undefined;
                                }
                            }
                            if (p) {
                                hasData = true;
                                if (p.variesAcrossStates) varies = true;
                                if (p.overriddenAtCurrent) override = true;
                            }
                        }
                    }

                    props.push({
                        propRef: refs.join(','),
                        display: row.display,
                        compName: row.compName,
                        kind: kind,
                        variesAcrossStates: varies,
                        overriddenAtCurrent: override,
                        valueByState: combinedValueByState,
                        defaultValue: combinedDefault,
                        refs: refs
                    });
                }

                cNode.members.push({
                    nodeUuid: sInfo.nodeUuid,
                    nodeName: sInfo.nodeName,
                    nodePath: sInfo.nodePath,
                    props: props
                });
            }
        }
        
        topology.controllers.push(cNode);
    }
    return topology;
}

module.exports = {
    getCtrlSnapshot: getCtrlSnapshot,
    setSelectedIndex: setSelectedIndex,
    setStateById: setStateById,
    setRecording: setRecording,
    cancelRecording: cancelRecording,
    addState: addState,
    removeState: removeState,
    restoreLastDeletedState: restoreLastDeletedState,
    listDeletedStates: listDeletedStates,
    restoreDeletedState: restoreDeletedState,
    purgeDeletedState: purgeDeletedState,
    purgeAllDeletedStates: purgeAllDeletedStates,
    previewDeletedState: previewDeletedState,
    exitPreview: exitPreview,
    addProperty: addProperty,
    removeProperty: removeProperty,
    installBroadcastBridge: installBroadcastBridge,
    getPropStateValues: getPropStateValues,
    serializeStateValue: serializeStateValue,
    buildTopology: buildTopology,
};
