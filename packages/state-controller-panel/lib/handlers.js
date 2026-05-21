/**
 * state-controller-panel — Pure IPC handler 层 (Wave 3 Panel scaffold).
 *
 * 所有面板操作的纯函数实现, 不依赖 Cocos Editor 全局.
 * 接收 ctrl 实例 (+ 必要时 select 实例) 与参数, 返回结果.
 *
 * scene-accessor.js 上层负责:
 *   - 通过 uuid 把 message 路由到对应 ctrl/select 实例
 *   - 包 event.reply 回包
 *   - 把 installBroadcastBridge 的 send 接到 Editor.Ipc.sendToPanel
 *
 * 设计原则 (与 brief v0.2 §1 一致):
 *   - core 永远薄: 全部走 capability 接口
 *   - panel 不 import StateController, 仅经 capability + 这层 handler
 *   - 错误兜底: ctrl 为 null/undefined 不抛, 返回安全值
 */

'use strict';

// L0 capability 自注册. 引用一次即可触发 register.
require('../../../assets/script/controller/capabilities');

const { CapabilityRegistry } = require('../../../assets/script/controller/CapabilityRegistry');
const { EnumPropName } = require('../../../assets/script/controller/StateEnum');

function cap(name) {
    return CapabilityRegistry.get(name);
}

function safeCtrlId(ctrl) {
    return (ctrl && typeof ctrl.ctrlId === 'number') ? ctrl.ctrlId : -1;
}

/**
 * 完整快照, 供 Panel 渲染. 一次性读取避免多次 IPC round-trip.
 */
function getCtrlSnapshot(ctrl) {
    if (!ctrl) return null;
    const selPageId = cap('selectedPageId');
    const homePage = cap('homePage');
    const states = selPageId ? selPageId.listAllStates(ctrl) : [];

    return {
        ctrlId: ctrl.ctrlId,
        ctrlName: ctrl.ctrlName || '',
        selectedIndex: ctrl.selectedIndex,
        selectedStateId: selPageId ? selPageId.getSelectedStateId(ctrl) : -1,
        homePageStateId: homePage ? homePage.getHomePage(ctrl) : -1,
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
    const c = cap('selectedPageId');
    if (!c) return false;
    return c.setStateById(ctrl, stateId);
}

function setHomePage(ctrl, stateIdOrName) {
    if (!ctrl) return false;
    const c = cap('homePage');
    if (!c) return false;

    if (stateIdOrName === -1) {
        c.setHomePage(ctrl, -1);
        return true;
    }

    // 调用前快照, 若调用后值未变则视为失败 (stateId/Name 不存在)
    const before = c.getHomePage(ctrl);
    c.setHomePage(ctrl, stateIdOrName);
    const after = c.getHomePage(ctrl);

    if (typeof stateIdOrName === 'number') {
        return after === stateIdOrName;
    }
    // name 路径: 看是否切到了对应 stateId
    const selPageId = cap('selectedPageId');
    if (!selPageId) return after !== before;
    const expectedId = selPageId.getStateIdByName(ctrl, stateIdOrName);
    return expectedId !== -1 && after === expectedId;
}

function setRecording(ctrl, isRecording) {
    if (!ctrl) return false;
    if (isRecording) {
        if (typeof ctrl.startRecording === 'function') ctrl.startRecording();
    } else if (typeof ctrl.stopRecording === 'function') ctrl.stopRecording();
    return true;
}

/**
 * 新增 state. 走 StateController.states setter (复用 smart-name + stateId 分配逻辑).
 * 返回新 stateId, 失败返回 -1.
 */
function addState(ctrl, name) {
    if (!ctrl || !ctrl._states) return -1;
    // StateValue.create 通过 StateController 自己的 stateIdAuto 自增分配
    // 简单做法: 用 setter 触发, name 通过 _historyStateName 路径名字会被识别为手工
    // 更直接: 直接 splice + 让 setter 内部分配 stateId
    const StateController = ctrl.constructor;
    const Mod = require('../../../assets/script/controller/StateController');
    const StateValue = Mod.StateValue;
    const beforeIds = new Set(ctrl._states.map(function (s) { return s.stateId; }));
    const newState = StateValue.create(name || ('S' + ctrl._states.length), ctrl.stateIdAuto++);
    const newStates = ctrl._states.slice();
    newStates.push(newState);
    ctrl.states = newStates;

    // setter 内部可能改写 newState 引用; 用 id diff 找到新加入的 stateId
    let newId = -1;
    for (var i = 0; i < ctrl._states.length; i++) {
        if (!beforeIds.has(ctrl._states[i].stateId)) {
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
 * 把 capability 事件流 + setRecording 转成 IPC broadcast.
 *
 * @param ctrl - 目标 controller
 * @param send - (eventName, payload) => void, 上层接 Editor.Ipc.sendToPanel
 * @returns unsubscribe() 卸载所有 listener
 */
function installBroadcastBridge(ctrl, send) {
    if (!ctrl || typeof send !== 'function') return function () {};
    const event = cap('event');
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

    // setRecording 走 capability "onRecordingStart/Stop" — 注册 ad-hoc capability 实现转发
    // 用 Registry 注册一个临时 capability 实例 (面向单 ctrl 过滤)
    const recBridgeName = '_panelRecordingBridge_' + ctrl.ctrlId;
    const recBridge = {
        name: recBridgeName,
        onRecordingStart: function (ctx) {
            if (ctx.ctrl === ctrl) send('onRecordingChanged', { ctrlId: safeCtrlId(ctrl), isRecording: true });
        },
        onRecordingStop: function (ctx) {
            if (ctx.ctrl === ctrl) send('onRecordingChanged', { ctrlId: safeCtrlId(ctrl), isRecording: false });
        },
    };
    CapabilityRegistry.register(recBridge);

    return function unsubscribe() {
        event.off(ctrl, 'stateChanged', stateChangedCb);
        CapabilityRegistry.unregister(recBridgeName);
    };
}

module.exports = {
    getCtrlSnapshot: getCtrlSnapshot,
    setSelectedIndex: setSelectedIndex,
    setStateById: setStateById,
    setHomePage: setHomePage,
    setRecording: setRecording,
    addState: addState,
    removeState: removeState,
    addProperty: addProperty,
    installBroadcastBridge: installBroadcastBridge,
    // 给 scene-accessor 包路由用
    EnumPropName: EnumPropName,
};
