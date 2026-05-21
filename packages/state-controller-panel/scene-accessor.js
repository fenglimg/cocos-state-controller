'use strict';

/**
 * State Controller Panel — Scene Script (Wave 3 scaffold).
 *
 * 跑在 Cocos 编辑器 scene 上下文 (有 cc / Editor 全局), 把 panel IPC 消息路由到
 * scene 里的 StateController 实例上, 调 lib/handlers.js 的纯函数完成业务.
 *
 * 消息名规则 (与 panel/build.js 对应):
 *   state-controller-panel:get-ctrl-snapshot
 *   state-controller-panel:set-selected-index
 *   state-controller-panel:set-state-by-id
 *   state-controller-panel:set-home-page
 *   state-controller-panel:set-recording
 *   state-controller-panel:add-state
 *   state-controller-panel:remove-state
 *   state-controller-panel:add-property
 *   state-controller-panel:list-ctrls   (扫场景列所有 StateController)
 *
 * 广播事件名 (Editor.Ipc.sendToPanel):
 *   state-controller-panel:on-state-changed
 *   state-controller-panel:on-recording-changed
 *   state-controller-panel:on-data-changed
 *
 * TODO Gemini 接入 panel UI 时验证:
 *   - require('./lib/handlers') 在 scene-script 上下文是否可达
 *     (handlers.js 进一步 require 项目内 assets/script/controller/*).
 *     如不可达, 把 handlers 改成 inline 或通过 Editor.require 解析.
 */

const handlers = require('./lib/handlers');

/** 临时持有: 当前 panel 关注的 ctrl uuid → unsubscribe 函数 */
const broadcastBridges = new Map();

function getNodeByUuid(uuid) {
    // cocos 2.x scene 上下文 API; 编辑器外的 Jest 测试不走这里 (handlers 单元已覆盖)
    if (typeof cc === 'undefined' || !cc.engine) return null;
    return cc.engine.getInstanceById(uuid) || null;
}

function getCtrlByUuid(uuid) {
    const node = getNodeByUuid(uuid);
    if (!node) return null;
    return node.getComponent('StateController') || null;
}

function getSelectByUuid(uuid) {
    const node = getNodeByUuid(uuid);
    if (!node) return null;
    return node.getComponent('StateSelect') || null;
}

function broadcast(eventSuffix, payload) {
    if (typeof Editor === 'undefined' || !Editor.Ipc) return;
    Editor.Ipc.sendToPanel('state-controller-panel', 'state-controller-panel:' + eventSuffix, payload);
}

function ensureBridge(ctrl) {
    if (!ctrl) return;
    if (broadcastBridges.has(ctrl.ctrlId)) return;
    const unsub = handlers.installBroadcastBridge(ctrl, function (eventName, payload) {
        // eventName 形如 onStateChanged → on-state-changed
        const suffix = eventName.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); });
        broadcast(suffix, payload);
    });
    broadcastBridges.set(ctrl.ctrlId, unsub);
}

function disposeBridge(ctrlId) {
    const unsub = broadcastBridges.get(ctrlId);
    if (unsub) {
        try { unsub(); } catch (_) { /* noop */ }
        broadcastBridges.delete(ctrlId);
    }
}

module.exports = {

    'get-ctrl-snapshot'(event, payload) {
        const ctrl = getCtrlByUuid(payload && payload.uuid);
        if (!ctrl) return event.reply('ctrl not found', null);
        ensureBridge(ctrl);
        event.reply(null, handlers.getCtrlSnapshot(ctrl));
    },

    'set-selected-index'(event, payload) {
        const ctrl = getCtrlByUuid(payload && payload.uuid);
        if (!ctrl) return event.reply('ctrl not found', false);
        event.reply(null, handlers.setSelectedIndex(ctrl, payload.index));
    },

    'set-state-by-id'(event, payload) {
        const ctrl = getCtrlByUuid(payload && payload.uuid);
        if (!ctrl) return event.reply('ctrl not found', false);
        event.reply(null, handlers.setStateById(ctrl, payload.stateId));
    },

    'set-home-page'(event, payload) {
        const ctrl = getCtrlByUuid(payload && payload.uuid);
        if (!ctrl) return event.reply('ctrl not found', false);
        event.reply(null, handlers.setHomePage(ctrl, payload.stateIdOrName));
    },

    'set-recording'(event, payload) {
        const ctrl = getCtrlByUuid(payload && payload.uuid);
        if (!ctrl) return event.reply('ctrl not found', false);
        event.reply(null, handlers.setRecording(ctrl, !!payload.isRecording));
        // setRecording 是局部状态变, 顺手广播 data-changed 给 panel 刷新
        broadcast('on-data-changed', { ctrlId: ctrl.ctrlId });
    },

    'add-state'(event, payload) {
        const ctrl = getCtrlByUuid(payload && payload.uuid);
        if (!ctrl) return event.reply('ctrl not found', -1);
        const newId = handlers.addState(ctrl, payload.name || '');
        event.reply(null, newId);
        broadcast('on-data-changed', { ctrlId: ctrl.ctrlId });
        if (typeof Editor !== 'undefined' && Editor.Ipc) Editor.Ipc.sendToMain('scene:set-dirty');
    },

    'remove-state'(event, payload) {
        const ctrl = getCtrlByUuid(payload && payload.uuid);
        if (!ctrl) return event.reply('ctrl not found', false);
        const ok = handlers.removeState(ctrl, payload.index);
        event.reply(null, ok);
        if (ok) {
            broadcast('on-data-changed', { ctrlId: ctrl.ctrlId });
            if (typeof Editor !== 'undefined' && Editor.Ipc) Editor.Ipc.sendToMain('scene:set-dirty');
        }
    },

    'add-property'(event, payload) {
        const ctrl = getCtrlByUuid(payload && payload.ctrlUuid);
        const select = getSelectByUuid(payload && payload.selectUuid);
        if (!ctrl || !select) return event.reply('ctrl or select not found', false);
        const ok = handlers.addProperty(ctrl, select, payload.propType);
        event.reply(null, ok);
        if (ok) {
            broadcast('on-data-changed', { ctrlId: ctrl.ctrlId });
            if (typeof Editor !== 'undefined' && Editor.Ipc) Editor.Ipc.sendToMain('scene:set-dirty');
        }
    },

    /**
     * 列场景里所有 StateController. Panel 打开时调用, 拿 controller 树.
     * 返回 [{ uuid, ctrlId, ctrlName }].
     */
    'list-ctrls'(event) {
        const out = [];
        if (typeof cc === 'undefined' || !cc.director || !cc.director.getScene) {
            return event.reply(null, out);
        }
        const scene = cc.director.getScene();
        if (!scene) return event.reply(null, out);

        function walk(node) {
            if (!node) return;
            const ctrl = node.getComponent('StateController');
            if (ctrl) {
                out.push({ uuid: node.uuid, ctrlId: ctrl.ctrlId, ctrlName: ctrl.ctrlName || '' });
                ensureBridge(ctrl);
            }
            if (node.children) {
                for (let i = 0; i < node.children.length; i++) walk(node.children[i]);
            }
        }
        walk(scene);
        event.reply(null, out);
    },

    /**
     * panel 关闭时调用, 解除所有广播桥, 避免 leak.
     */
    'dispose-all-bridges'(event) {
        const ids = [];
        broadcastBridges.forEach(function (_, id) { ids.push(id); });
        ids.forEach(disposeBridge);
        event.reply(null, true);
    },
};
