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

// 加载阶段日志: 帮诊断 cocos 2.x scene-script 静默吞错. 若控制台看不到
// "[state-controller-panel] scene-script loaded" 说明 require 链失败.
try {
    if (typeof Editor !== 'undefined' && Editor.log) {
        Editor.log('[state-controller-panel] scene-accessor.js loading...');
    }
} catch (_) { /* noop */ }

let handlers;
try {
    handlers = require('./lib/handlers');
    if (typeof Editor !== 'undefined' && Editor.log) {
        Editor.log('[state-controller-panel] scene-script loaded, handlers keys:', Object.keys(handlers).join(','));
    }
} catch (e) {
    if (typeof Editor !== 'undefined' && Editor.error) {
        Editor.error('[state-controller-panel] handlers.js load failed:', e && (e.stack || e.message || String(e)));
    }
    handlers = {};
}

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

// ===== inspector 行枚举 (P2b 排除 + M1 状态行为可视化 共用) =====
// 复刻 PrefabIntrospection.enumPropsForCtor 的过滤 (跳 _前缀 / SYSTEM_EXCLUDE / visible:false / readonly),
// 按 inspector 显示行结构产出 [{ scope, display, refs }]:
//   scope = 组件序号 (node._components 下标, 对齐 inspector __comps__.<idx>) | 'node'
//   refs  = 该行的 leaf propRef 列表 (cc.Node 段按显示名聚合 x/y 等)
const SCI_SYSTEM_EXCLUDE = {
    'cc.Widget.target': 1, 'cc.Widget.alignFlags': 1, 'cc.Animation.defaultClip': 1,
    'cc.Animation.currentClip': 1, 'cc.ParticleSystem.file': 1, 'cc.AudioSource.clip': 1,
    'cc.Node.rotation': 1, 'cc.Node.rotationX': 1, 'cc.Node.rotationY': 1,
};
const SCI_CONTROLLER_COMPS = { StateSelect: 1, StateController: 1, StateValue: 1, stateValue: 1 };
const SCI_NODE_AGG = {
    Position: ['x', 'y'], Scale: ['scaleX', 'scaleY'], Anchor: ['anchorX', 'anchorY'],
    Size: ['width', 'height'], Rotation: ['angle'], Color: ['color'], Opacity: ['opacity'],
    Skew: ['skewX', 'skewY'],
};

function sciHumanize(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, function (c) { return c.toUpperCase(); }).replace(/\s+/g, ' ').trim();
}

function sciEnumCompProps(ctor, compName, Attr) {
    const out = [];
    const props = ctor && ctor.__props__;
    if (!Array.isArray(props)) return out;
    const attrs = (Attr && Attr.getClassAttrs) ? Attr.getClassAttrs(ctor) : {};
    for (let i = 0; i < props.length; i++) {
        const key = props[i];
        if (key.charAt(0) === '_') continue;
        const propRef = compName + '.' + key;
        if (SCI_SYSTEM_EXCLUDE[propRef]) continue;
        if (attrs[key + '$_$visible'] === false) continue;
        if (attrs[key + '$_$hasGetter'] === true && attrs[key + '$_$hasSetter'] !== true) continue; // readonly
        out.push({ propRef: propRef, display: attrs[key + '$_$displayName'] || sciHumanize(key) });
    }
    return out;
}

/** 插件侧按 propRef 读节点当前值 (mirror StateSelect.readNodeValueByPropRef, 不 require 项目源). */
function readNodeValByRef(node, propRef) {
    if (!node || typeof propRef !== 'string') return undefined;
    const lastDot = propRef.lastIndexOf('.');
    if (lastDot <= 0 || lastDot >= propRef.length - 1) return undefined;
    const compName = propRef.substring(0, lastDot);
    const key = propRef.substring(lastDot + 1);
    if (compName === 'cc.Node') return node[key];
    const comp = node.getComponent(compName);
    if (!comp) return undefined;
    return comp[key];
}

/** 枚举选中节点的所有 inspector 显示行 → [{ scope, display, refs }] (无过滤, 由各调用方加语义). */
function enumInspectorRows(node) {
    const cc_ = (typeof cc !== 'undefined') ? cc : null;
    const Attr = cc_ && cc_.Class && cc_.Class.Attr;
    const rows = [];
    const comps = node._components || (node.getComponents ? node.getComponents(cc_ ? cc_.Component : Object) : []);
    for (let ci = 0; ci < comps.length; ci++) {
        const comp = comps[ci];
        if (!comp) continue;
        const cn = comp.__classname__ || (comp.constructor && comp.constructor.name) || '';
        if (SCI_CONTROLLER_COMPS[cn]) continue;
        const plist = sciEnumCompProps(comp.constructor, cn, Attr);
        for (let pi = 0; pi < plist.length; pi++) {
            rows.push({ scope: ci, display: plist[pi].display, refs: [plist[pi].propRef] });
        }
    }
    // cc.Node 内置段: 按 inspector 显示名聚合 (2D inspector Position 只显 X/Y, 不含 z)
    for (const disp in SCI_NODE_AGG) {
        const subs = SCI_NODE_AGG[disp];
        const refs = [];
        for (let si = 0; si < subs.length; si++) {
            const pr = 'cc.Node.' + subs[si];
            if (!SCI_SYSTEM_EXCLUDE[pr]) refs.push(pr);
        }
        if (refs.length) rows.push({ scope: 'node', display: disp, refs: refs });
    }
    return rows;
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

    'set-recording'(event, payload) {
        const ctrl = getCtrlByUuid(payload && payload.uuid);
        if (!ctrl) return event.reply('ctrl not found', false);
        event.reply(null, handlers.setRecording(ctrl, !!payload.isRecording));
        // setRecording 是局部状态变, 顺手广播 data-changed 给 panel 刷新
        broadcast('on-data-changed', { ctrlId: ctrl.ctrlId });
    },

    /**
     * TASK-002: 撤销本次录制. 调 ctrl.cancelRecording, ctrlData 回滚 + 视觉同步回滚.
     * 同时广播 data-changed 让 panel 刷新; onRecordingCancelled 由 broadcast bridge 自动转发.
     */
    'cancel-recording'(event, payload) {
        const ctrl = getCtrlByUuid(payload && payload.uuid);
        if (!ctrl) return event.reply('ctrl not found', false);
        event.reply(null, handlers.cancelRecording(ctrl));
        broadcast('on-data-changed', { ctrlId: ctrl.ctrlId });
        if (typeof Editor !== 'undefined' && Editor.Ipc) Editor.Ipc.sendToMain('scene:set-dirty');
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

    /** TASK-003: 移除 prop 跟随. 跟 'add-property' 同模板, 调 handlers.removeProperty. */
    'remove-property'(event, payload) {
        const ctrl = getCtrlByUuid(payload && payload.ctrlUuid);
        const select = getSelectByUuid(payload && payload.selectUuid);
        if (!ctrl || !select) return event.reply('ctrl or select not found', false);
        const ok = handlers.removeProperty(ctrl, select, payload.propType);
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
     * 新增观测树聚合查询. 返回整个场景的控制器-成员-属性拓扑结构.
     */
    'list-scene-topology'(event) {
        if (typeof cc === 'undefined' || !cc.director || !cc.director.getScene) {
            return event.reply(null, { controllers: [] });
        }
        const scene = cc.director.getScene();
        if (!scene) return event.reply(null, { controllers: [] });

        const ctrlsInfo = [];
        const selectsInfo = [];

        function getNodePath(node) {
            let path = node.name;
            let curr = node.parent;
            while (curr && curr.parent) { 
                path = curr.name + '/' + path;
                curr = curr.parent;
            }
            return path;
        }

        function walk(node) {
            if (!node) return;
            const ctrl = node.getComponent('StateController');
            if (ctrl) {
                ctrlsInfo.push({ uuid: node.uuid, ctrl: ctrl });
                ensureBridge(ctrl);
            }
            const select = node.getComponent('StateSelect');
            if (select) {
                selectsInfo.push({
                    nodeUuid: node.uuid,
                    nodeName: node.name,
                    nodePath: getNodePath(node),
                    select: select,
                    getRowsInfo: function() {
                        const userExcluded = {};
                        const ue = select._userExcludedProps || [];
                        for (let i = 0; i < ue.length; i++) userExcluded[ue[i]] = 1;
                        const canCtrl = typeof select.isPropertyControlledByPropRef === 'function';

                        function classify(propRef) {
                            if (userExcluded[propRef]) return 'excluded';
                            let ctrled = false;
                            if (canCtrl) { try { ctrled = !!select.isPropertyControlledByPropRef(propRef); } catch (e) { ctrled = false; } }
                            return ctrled ? 'tracked' : 'loose';
                        }
                        
                        function rowKind(refs) {
                            let t = 0, e = 0, l = 0;
                            for (let i = 0; i < refs.length; i++) {
                                const k = classify(refs[i]);
                                if (k === 'tracked') t++; else if (k === 'excluded') e++; else l++;
                            }
                            if (l > 0) return (t > 0 || e > 0) ? 'mixed' : 'loose';
                            if (e > 0) return (t > 0) ? 'mixed' : 'excluded';
                            return 'tracked';
                        }

                        const rows = enumInspectorRows(node);
                        const result = [];
                        for (let i = 0; i < rows.length; i++) {
                            const kind = rowKind(rows[i].refs);
                            let compName = rows[i].scope === 'node' ? 'cc.Node' : '';
                            if (rows[i].scope !== 'node' && node._components && node._components[rows[i].scope]) {
                                const comp = node._components[rows[i].scope];
                                compName = comp.__classname__ || (comp.constructor && comp.constructor.name) || '';
                            }
                            result.push({
                                display: rows[i].display,
                                refs: rows[i].refs,
                                kind: kind,
                                compName: compName
                            });
                        }
                        return result;
                    }
                });
            }
            if (node.children) {
                for (let i = 0; i < node.children.length; i++) walk(node.children[i]);
            }
        }
        walk(scene);
        
        const topology = handlers.buildTopology(ctrlsInfo, selectsInfo);
        event.reply(null, topology);
    },

    /**
     * P2b: inspector 注入层查询 "选中节点上**非全受控**的属性行".
     *
     * 语义反转 (用户决策): auto-opt-in 让绝大多数属性受控 → 标记受控是噪音; 真正有价值的是**例外**:
     *   - excluded: 用户主动排除 (在 select._userExcludedProps)
     *   - loose:    可跟踪但没受控 (掉出控制 / 未接入) ← prefab-diff 漏更新的 bug 信号
     *   - mixed:    聚合行 (Vec) 子项里既有受控又有未受控/排除
     * 全部受控的行不返回 → 注入侧不打标 (干净).
     *
     * 实现: 不 require 项目 ts 源, 在 plugin 侧用 cc 反射枚举 trackable props (复刻
     * PrefabIntrospection.enumPropsForCtor 的过滤: 跳 _前缀 / SYSTEM_EXCLUDE / visible:false / readonly),
     * 受控/排除判定走活 select 实例公开 API. cc.Node 按 inspector 显示名聚合 (Position=x/y 等).
     *
     * payload = { uuid }, reply = { ok, hasSelect, items: [{ scope, display, kind, refs }] }
     *   scope = 组件序号 (node._components 下标, 与 inspector __comps__.<idx> 对齐) | 'node'; display = 显示名; kind = excluded|loose|mixed
     */
    'inspector-prop-status'(event, payload) {
        const reply = function (r) { if (event && event.reply) event.reply(null, r); };
        const node = getNodeByUuid(payload && payload.uuid);
        if (!node) return reply({ ok: false, reason: 'no node' });
        const select = node.getComponent('StateSelect');
        if (!select) return reply({ ok: true, hasSelect: false, items: [] });

        const userExcluded = {};
        const ue = select._userExcludedProps || [];
        for (let i = 0; i < ue.length; i++) userExcluded[ue[i]] = 1;
        const canCtrl = typeof select.isPropertyControlledByPropRef === 'function';

        function classify(propRef) {
            if (userExcluded[propRef]) return 'excluded';
            let ctrled = false;
            if (canCtrl) { try { ctrled = !!select.isPropertyControlledByPropRef(propRef); } catch (e) { ctrled = false; } }
            return ctrled ? 'tracked' : 'loose';
        }
        // 一行 (单 prop 或聚合多子项) → kind. 全 tracked 返回 null (不标)
        function rowKind(refs) {
            let t = 0, e = 0, l = 0;
            for (let i = 0; i < refs.length; i++) {
                const k = classify(refs[i]);
                if (k === 'tracked') t++; else if (k === 'excluded') e++; else l++;
            }
            if (l > 0) return (t > 0 || e > 0) ? 'mixed' : 'loose';
            if (e > 0) return (t > 0) ? 'mixed' : 'excluded';
            return null;
        }

        const items = [];
        const rows = enumInspectorRows(node);
        for (let i = 0; i < rows.length; i++) {
            const kind = rowKind(rows[i].refs);
            if (kind) items.push({ scope: rows[i].scope, display: rows[i].display, kind: kind, refs: rows[i].refs });
        }
        reply({ ok: true, hasSelect: true, items: items });
    },

    /**
     * M1-1/M1-2: inspector 状态行为可视化查询. 返回:
     *   - props: 各受控 propRef 的 { variesAcrossStates, valueByState:{[idx]:serialized}, defaultValue } (M1-1 primitive)
     *   - states: [{index, stateId, name}] (hover 标题用)
     *   - rows: inspector 行视图 [{ scope, display, refs, variesAcrossStates }] — 注入侧据此对
     *           「跨状态有差异」的行标 ● (varies = 行内任一 ref 在 props 里 variesAcrossStates).
     * 纯读, 不改 ctrlData. payload = { uuid }.
     */
    'inspector-prop-state-values'(event, payload) {
        const reply = function (r) { if (event && event.reply) event.reply(null, r); };
        const node = getNodeByUuid(payload && payload.uuid);
        if (!node) return reply({ ok: false, reason: 'no node' });
        const select = node.getComponent('StateSelect');
        if (!select) return reply({ ok: true, hasSelect: false, states: [], props: {}, rows: [] });
        // ctrl 从 select 推导 (可能在祖先节点上); handlers 内部兜底再推一次
        const ctrl = (select._ctrlsMap && select._ctrlsMap[select.currCtrlId]) || node.getComponent('StateController') || null;
        const sv = handlers.getPropStateValues(select, ctrl);
        // M2a-1: 录制态 → 标"改过未提交"的脏行 (节点当前值 ≠ 该 state 存储值, default 兜底).
        const isRecording = !!(ctrl && ctrl.isRecording);
        sv.isRecording = isRecording;
        const selIdx = sv.selectedIndex;
        function isRowDirty(refs) {
            if (!isRecording || selIdx < 0) return false;
            for (let r = 0; r < refs.length; r++) {
                const p = sv.props && sv.props[refs[r]];
                if (!p) continue;
                const curSer = handlers.serializeStateValue(readNodeValByRef(node, refs[r]));
                let base = p.valueByState ? p.valueByState[selIdx] : undefined;
                if (base === null || base === undefined) base = p.defaultValue;
                if (base === undefined) base = null;
                if (JSON.stringify(curSer) !== JSON.stringify(base)) return true;
            }
            return false;
        }
        // 行视图: 把 props (per-ref varies/override/dirty) join 到 inspector 显示行
        const rows = enumInspectorRows(node);
        sv.rows = [];
        for (let i = 0; i < rows.length; i++) {
            const refs = rows[i].refs;
            let varies = false, override = false, hasData = false;
            for (let r = 0; r < refs.length; r++) {
                const p = sv.props && sv.props[refs[r]];
                if (p) {
                    hasData = true;
                    if (p.variesAcrossStates) varies = true;
                    if (p.overriddenAtCurrent) override = true;
                }
            }
            if (hasData) sv.rows.push({
                scope: rows[i].scope, display: rows[i].display, refs: refs,
                variesAcrossStates: varies, overriddenAtCurrent: override,
                dirty: isRowDirty(refs),
            });
        }
        reply(sv);
    },

    /**
     * P2b 写半边: 点击 inspector 标记 → 切换某些 propRef 的排除状态.
     *
     * M2b-1 后: 走干净的 select.setPropExcluded(ref, bool) mutation API (替代旧的
     * "改 _userExcludedProps 数组 + 读 excludedPropsDisplay getter 副作用" hack). 该方法内部
     * 改数组 + togglePropertyControl 同步跟踪态 + 同步 _lastSeenExcluded 快照.
     *
     * Undo: best-effort 包 _Scene.Undo.recordObject/commit (项目无先例, API 不对也不影响写入).
     * payload = { uuid, refs: [propRef...], action: 'exclude'|'unexclude' }
     */
    'inspector-toggle-exclude'(event, payload) {
        const reply = function (r) { if (event && event.reply) event.reply(null, r); };
        const node = getNodeByUuid(payload && payload.uuid);
        if (!node) return reply({ ok: false, reason: 'no node' });
        const select = node.getComponent('StateSelect');
        if (!select) return reply({ ok: false, reason: 'no select' });
        const refs = (payload && payload.refs) || [];
        const action = payload && payload.action;
        if (!refs.length || (action !== 'exclude' && action !== 'unexclude')) {
            return reply({ ok: false, reason: 'bad payload' });
        }

        // Undo best-effort: 记录变更前 (项目内无 _Scene.Undo 先例, 容错处理)
        const Undo = (typeof _Scene !== 'undefined' && _Scene) ? _Scene.Undo : null;
        try { if (Undo && Undo.recordObject) Undo.recordObject(node.uuid, 'state-controller: toggle exclude'); } catch (e) { /* noop */ }

        const excluded = (action === 'exclude');
        const useApi = typeof select.setPropExcluded === 'function';
        for (let i = 0; i < refs.length; i++) {
            if (useApi) {
                try { select.setPropExcluded(refs[i], excluded); } catch (e) { /* noop */ }
            } else {
                // 兜底 (旧组件无 setPropExcluded): 退回数组 + getter 副作用路径
                if (!select._userExcludedProps) select._userExcludedProps = [];
                const idx = select._userExcludedProps.indexOf(refs[i]);
                if (excluded) { if (idx === -1) select._userExcludedProps.push(refs[i]); }
                else { if (idx >= 0) select._userExcludedProps.splice(idx, 1); }
                try { void select.excludedPropsDisplay; } catch (e) { /* noop */ }
            }
        }

        try { if (Undo && Undo.commit) Undo.commit(); } catch (e) { /* noop */ }
        // 标脏 → 可 Ctrl+S 存盘
        if (typeof Editor !== 'undefined' && Editor.Ipc) Editor.Ipc.sendToMain('scene:set-dirty');
        // 广播 data-changed (其它面板 / 监听方刷新)
        const ctrl = node.getComponent('StateController');
        if (ctrl) broadcast('on-data-changed', { ctrlId: ctrl.ctrlId });
        reply({ ok: true });
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
