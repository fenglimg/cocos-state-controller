'use strict';

/**
 * Scene-process IPC bridge for ccc-state-controller-workbench.
 *
 * Cocos Creator 2.4 process model:
 *   main.js        — main process (no cc.*)
 *   panel/index.js — panel process (no cc.*)
 *   THIS FILE      — scene script (cc.* available; only place that touches cc.Node)
 *
 * Boundary rule (BOUNDARY-2): never `require` runtime types (StateController/StateSelect).
 * All identification goes through cc.js.getClassName() string match (see lib/inspector.js).
 *
 * All cc-node mutations go through `withSetProperty` (single write) or `withSnapshot`
 * (group-level Undo). Panel <-> scene IPC payloads carry only JSON-safe data
 * (uuid strings, plain numbers/strings/objects — no cc instances).
 */

const inspector = require('./lib/inspector');
const stateGraph = require('./lib/state-graph');
const installer = require('./lib/installer');
const healthCheck = require('./lib/health-check');
const logger = require('./logger');

// ──────────────────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Locate a node by uuid. Prefer cc.engine.getInstanceById, fallback to BFS.
 */
function getNodeByUuid(uuid) {
    if (!uuid) return null;
    try {
        if (typeof cc !== 'undefined' && cc.engine && typeof cc.engine.getInstanceById === 'function') {
            const n = cc.engine.getInstanceById(uuid);
            if (n) return n;
        }
    }
    catch (_) { /* swallowed: scene queries are best-effort */ }
    // Fallback BFS (rare path)
    try {
        const scene = cc.director && cc.director.getScene && cc.director.getScene();
        if (!scene) return null;
        const queue = [scene];
        let safety = 0;
        while (queue.length && safety < 5000) {
            const n = queue.shift();
            safety++;
            if (n && n.uuid === uuid) return n;
            if (n && n.children) for (const c of n.children) queue.push(c);
        }
    }
    catch (_) { /* swallowed: scene queries are best-effort */ }
    return null;
}

/**
 * Walk the scene graph and collect every component that matches a class name
 * (using cc.js.getClassName + duck typing — no runtime imports).
 */
function collectAllComponents() {
    const controllers = [];
    const selects = [];
    let scene = null;
    try {
        if (typeof cc !== 'undefined' && cc.director && cc.director.getScene) {
            scene = cc.director.getScene();
        }
    }
    catch (_) { /* swallowed: scene queries are best-effort */ }
    if (!scene) return { controllers: [], selects: [] };

    const queue = [scene];
    let safety = 0;
    while (queue.length && safety < 20000) {
        const n = queue.shift();
        safety++;
        if (!n) continue;
        if (Array.isArray(n._components)) {
            for (const comp of n._components) {
                if (inspector.isStateController(comp)) controllers.push(comp);
                else if (inspector.isStateSelect(comp)) selects.push(comp);
            }
        }
        if (n.children) for (const c of n.children) queue.push(c);
    }
    return { controllers, selects };
}

/**
 * Wrap a group of mutations in a scene:snapshot begin/end so Editor's Undo system
 * records them as a single step. (M5 will exercise this for add/delete-state.)
 *
 * Implementation detail: scene:snapshot is fire-and-forget; the actual Undo
 * coalescing is performed by the editor's host process.
 */
function withSnapshot(label, fn) {
    let result = null;
    try {
        if (typeof Editor !== 'undefined' && Editor.Ipc && typeof Editor.Ipc.sendRequestToPanel === 'function') {
            try { Editor.Ipc.sendRequestToPanel('scene', 'scene:snapshot', label); } catch (_) { /* snapshot best-effort */ }
        }
        result = fn();
    }
    finally {
        try {
            if (typeof Editor !== 'undefined' && Editor.Ipc && typeof Editor.Ipc.sendRequestToPanel === 'function') {
                Editor.Ipc.sendRequestToPanel('scene', 'scene:snapshot', `${label}:end`);
            }
        }
        catch (_) { /* swallowed: scene queries are best-effort */ }
    }
    return result;
}

/**
 * Write a single property via Editor's scene:set-property pipeline so Undo
 * records it. The payload object is fully JSON-safe.
 */
function withSetProperty(payload) {
    if (!payload || !payload.id || !payload.path || !payload.type) {
        throw new Error('withSetProperty requires payload {id, path, type, value}');
    }
    if (typeof Editor === 'undefined' || !Editor.Ipc || typeof Editor.Ipc.sendRequestToPanel !== 'function') {
        return false;
    }
    Editor.Ipc.sendRequestToPanel('scene', 'scene:set-property', payload);
    return true;
}

/**
 * Reflect the runtime controller instance for a given ctrlId. Used by M5 mutation
 * handlers to derive node uuid + path for the scene:set-property payload.
 *
 * Walks the cached scene graph (collectAllComponents) — pricier than caching, but
 * keeps the handler stateless across panel/scene IPC.
 */
function findControllerByCtrlId(ctrlId) {
    const { controllers } = collectAllComponents();
    for (const c of controllers) {
        if (c && c.ctrlId === ctrlId) return c;
    }
    return null;
}

function findSelectsByCtrlId(ctrlId) {
    const { selects } = collectAllComponents();
    return selects.filter((s) => s && s.currCtrlId === ctrlId);
}

// ──────────────────────────────────────────────────────────────────────────────
// RPC handlers (exported messages map)
// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
    /**
     * Build a snapshot of all controllers/selects in the scene.
     */
    'list-controllers'(event) {
        try {
            const { controllers, selects } = collectAllComponents();
            const raw = {
                controllers: controllers.map(inspector.inspectController).filter(Boolean),
                selects: selects.map(inspector.inspectSelect).filter(Boolean),
            };
            const graph = stateGraph.buildControllerGraph(raw);
            event.reply(null, graph);
        }
        catch (err) {
            logger.error(`list-controllers failed: ${err && err.message}`);
            event.reply(err, null);
        }
    },

    /**
     * Install the StateController runtime files from source -> target.
     *
     * payload: { sourceDir, targetDir, overwrite? }
     */
    'install-runtime'(event, payload) {
        try {
            const result = installer.installRuntime(payload || {});
            event.reply(null, result);
        }
        catch (err) {
            logger.error(`install-runtime failed: ${err && err.message}`);
            event.reply(err, null);
        }
    },

    /**
     * Inspect runtime install status (no-op vs missing/modified files).
     */
    'get-runtime-status'(event, payload) {
        try {
            const sourceDir = (payload && payload.sourceDir) || installer.getDefaultSourceDir(process.cwd());
            const targetDir = (payload && payload.targetDir) || sourceDir;
            const status = installer.getRuntimeStatus(sourceDir, targetDir);
            event.reply(null, status);
        }
        catch (err) {
            event.reply(err, null);
        }
    },

    /**
     * Wrap a panel-issued single-property write in scene:set-property so Undo records it.
     *
     * payload: { id, path, type, value }
     */
    'set-property-undo-aware'(event, payload) {
        try {
            const ok = withSetProperty(payload);
            event.reply(null, { ok });
        }
        catch (err) {
            event.reply(err, null);
        }
    },

    'snapshot-begin'(event, payload) {
        try {
            const label = (payload && payload.label) || 'workbench-snapshot';
            if (typeof Editor !== 'undefined' && Editor.Ipc && typeof Editor.Ipc.sendRequestToPanel === 'function') {
                Editor.Ipc.sendRequestToPanel('scene', 'scene:snapshot', label);
            }
            event.reply(null, { ok: true });
        }
        catch (err) {
            event.reply(err, null);
        }
    },

    'snapshot-end'(event, payload) {
        try {
            const label = (payload && payload.label) || 'workbench-snapshot:end';
            if (typeof Editor !== 'undefined' && Editor.Ipc && typeof Editor.Ipc.sendRequestToPanel === 'function') {
                Editor.Ipc.sendRequestToPanel('scene', 'scene:snapshot', label);
            }
            event.reply(null, { ok: true });
        }
        catch (err) {
            event.reply(err, null);
        }
    },

    // ────────────────────────────────────────────────────────────────────────
    // M5 — Config tab: state CRUD + property mutation (all Undo-aware)
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Update the selectedIndex of a controller via scene:set-property (single write, Undo-aware).
     * payload: { ctrlId, newIndex }
     */
    'set-selected-index'(event, payload) {
        try {
            const { ctrlId, newIndex } = payload || {};
            const ctrl = findControllerByCtrlId(ctrlId);
            if (!ctrl) throw new Error(`controller ctrlId=${ctrlId} not found`);
            withSetProperty({
                id: ctrl.node.uuid,
                path: 'selectedIndex',
                type: 'Number',
                value: newIndex,
            });
            event.reply(null, { ok: true });
        }
        catch (err) {
            logger.error(`set-selected-index failed: ${err && err.message}`);
            event.reply(err, null);
        }
    },

    /**
     * Rename a state on a controller via scene:set-property nested path.
     * payload: { ctrlId, stateId, newName }
     */
    'set-state-name'(event, payload) {
        try {
            const { ctrlId, stateId, newName } = payload || {};
            const ctrl = findControllerByCtrlId(ctrlId);
            if (!ctrl) throw new Error(`controller ctrlId=${ctrlId} not found`);
            const states = (ctrl.states || ctrl._states || []);
            const idx = states.findIndex((s) => s && s.stateId === stateId);
            if (idx < 0) throw new Error(`stateId=${stateId} not found`);
            withSetProperty({
                id: ctrl.node.uuid,
                path: `_states.${idx}.name`,
                type: 'String',
                value: String(newName),
            });
            event.reply(null, { ok: true });
        }
        catch (err) {
            logger.error(`set-state-name failed: ${err && err.message}`);
            event.reply(err, null);
        }
    },

    /**
     * Set a single controlled prop value on a StateSelect for a given (ctrlId, stateId).
     * payload: { nodeUuid, ctrlId, stateId, propType, value }
     */
    'set-prop-value'(event, payload) {
        try {
            const { nodeUuid, ctrlId, stateId, propType, value } = payload || {};
            if (!nodeUuid || ctrlId === undefined || stateId === undefined || propType === undefined) {
                throw new Error('payload requires {nodeUuid, ctrlId, stateId, propType, value}');
            }
            withSetProperty({
                id: nodeUuid,
                path: `_ctrlData.${ctrlId}.${stateId}.${propType}`,
                type: 'Object',
                value: value,
            });
            event.reply(null, { ok: true });
        }
        catch (err) {
            logger.error(`set-prop-value failed: ${err && err.message}`);
            event.reply(err, null);
        }
    },

    /**
     * Add a new state. Wrapped in scene:snapshot so the multi-step mutation
     * (state row insert + auto-id increment) is one Undo step.
     * payload: { ctrlId, stateName }
     */
    'add-state'(event, payload) {
        try {
            const { ctrlId, stateName } = payload || {};
            const ctrl = findControllerByCtrlId(ctrlId);
            if (!ctrl) throw new Error(`controller ctrlId=${ctrlId} not found`);
            withSnapshot('add-state', () => {
                if (typeof ctrl.addState === 'function') ctrl.addState(stateName);
            });
            event.reply(null, { ok: true });
        }
        catch (err) {
            logger.error(`add-state failed: ${err && err.message}`);
            event.reply(err, null);
        }
    },

    /**
     * Delete a state. Wrapped in scene:snapshot for group Undo.
     * Relies on M3-fixed deleteState() cascading EnumUpdataType.Delete to all
     * StateSelect instances so _ctrlData and _flatData are cleaned atomically.
     * payload: { ctrlId, stateId }
     */
    'delete-state'(event, payload) {
        try {
            const { ctrlId, stateId } = payload || {};
            const ctrl = findControllerByCtrlId(ctrlId);
            if (!ctrl) throw new Error(`controller ctrlId=${ctrlId} not found`);
            withSnapshot('delete-state', () => {
                if (typeof ctrl.deleteState === 'function') ctrl.deleteState(stateId);
            });
            event.reply(null, { ok: true });
        }
        catch (err) {
            logger.error(`delete-state failed: ${err && err.message}`);
            event.reply(err, null);
        }
    },

    /**
     * Copy all controlled-prop values from srcStateId to dstStateId on every
     * StateSelect that targets ctrlId. Wrapped in snapshot for group Undo.
     * payload: { srcCtrlId, srcStateId, dstStateId }
     */
    'copy-state-props'(event, payload) {
        try {
            const { srcCtrlId, srcStateId, dstStateId } = payload || {};
            if (srcCtrlId === undefined || srcStateId === undefined || dstStateId === undefined) {
                throw new Error('payload requires {srcCtrlId, srcStateId, dstStateId}');
            }
            const selects = findSelectsByCtrlId(srcCtrlId);
            withSnapshot('copy-state-props', () => {
                for (const sel of selects) {
                    const data = sel && sel._ctrlData && sel._ctrlData[srcCtrlId];
                    const srcState = data && data[srcStateId];
                    if (!srcState) continue;
                    for (const propType in srcState) {
                        if (Object.prototype.hasOwnProperty.call(srcState, propType)) {
                            withSetProperty({
                                id: sel.node.uuid,
                                path: `_ctrlData.${srcCtrlId}.${dstStateId}.${propType}`,
                                type: 'Object',
                                value: srcState[propType],
                            });
                        }
                    }
                }
            });
            event.reply(null, { ok: true });
        }
        catch (err) {
            logger.error(`copy-state-props failed: ${err && err.message}`);
            event.reply(err, null);
        }
    },

    /**
     * Run health-check.detect across the scene and auto-fix every issue with
     * autofix=true. Wrapped in a single snapshot.
     * payload: {}
     */
    'cleanup-orphans'(event) {
        try {
            const { controllers, selects } = collectAllComponents();
            const raw = {
                controllers: controllers.map(inspector.inspectController).filter(Boolean),
                selects: selects.map(inspector.inspectSelect).filter(Boolean),
            };
            const graph = stateGraph.buildControllerGraph(raw);
            const { issues } = healthCheck.detect(graph);
            const autofixable = issues.filter((i) => i.autofix);
            const fixed = [];
            withSnapshot('cleanup-orphans', () => {
                for (const issue of autofixable) {
                    if (issue.type === 'orphan-controller' && issue.nodeUuid) {
                        // Reset orphan currCtrlId to 0 (means "no controller")
                        withSetProperty({
                            id: issue.nodeUuid,
                            path: 'currCtrlId',
                            type: 'Number',
                            value: 0,
                        });
                        fixed.push(issue);
                    }
                }
            });
            event.reply(null, { totalIssues: issues.length, autofixCount: fixed.length, fixed });
        }
        catch (err) {
            logger.error(`cleanup-orphans failed: ${err && err.message}`);
            event.reply(err, null);
        }
    },

    /**
     * Run health-check.detect and return the issue list (panel renders the
     * Health tab from this).
     * payload: {}
     */
    'health-detect'(event) {
        try {
            const { controllers, selects } = collectAllComponents();
            const raw = {
                controllers: controllers.map(inspector.inspectController).filter(Boolean),
                selects: selects.map(inspector.inspectSelect).filter(Boolean),
            };
            const graph = stateGraph.buildControllerGraph(raw);
            const result = healthCheck.detect(graph);
            event.reply(null, result);
        }
        catch (err) {
            event.reply(err, null);
        }
    },

    // Internals exposed for unit tests
    __internals: { getNodeByUuid, collectAllComponents, withSnapshot, withSetProperty, findControllerByCtrlId, findSelectsByCtrlId },
};
