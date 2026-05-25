/**
 * state-controller-panel — Pure IPC handler 层.
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
    require('../../../assets/script/controller/capabilities/index');
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
 * 新增 state. 走 StateController.states setter (复用 smart-name + stateId 分配逻辑).
 * 返回新 stateId, 失败返回 -1.
 *
 * 不 require StateController 源: 用现有 state 的 constructor 当工厂.
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

/**
 * 手动添加 prop (panel "+ 添加属性" 按钮).
 * 调 StateSelect.togglePropertyControl, 触发 PropertyControlService 写入 _ctrlData.
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
 * 调 StateSelect.togglePropertyControl(false), 取消跟随 + 清 propData 中对应字段.
 */
function removeProperty(ctrl, select, propType) {
    if (!ctrl || !select) return false;
    if (typeof select.togglePropertyControl !== 'function') return false;
    select.togglePropertyControl(propType, false);
    return true;
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

module.exports = {
    getCtrlSnapshot: getCtrlSnapshot,
    setSelectedIndex: setSelectedIndex,
    setStateById: setStateById,
    setRecording: setRecording,
    cancelRecording: cancelRecording,
    addState: addState,
    removeState: removeState,
    addProperty: addProperty,
    removeProperty: removeProperty,
    installBroadcastBridge: installBroadcastBridge,
};
