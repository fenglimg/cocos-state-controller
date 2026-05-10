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

    // Internals exposed for unit tests
    __internals: { getNodeByUuid, collectAllComponents, withSnapshot, withSetProperty },
};
