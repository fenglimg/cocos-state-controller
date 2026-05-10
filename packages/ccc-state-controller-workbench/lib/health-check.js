'use strict';

/**
 * Health check — translates the descriptive ControllerGraph into a list of
 * actionable issues, and provides a fix() helper that drives the right
 * scene-accessor IPC.
 *
 * Dual-API split:
 *   detect(graph)  — pure function, no side effects, safe in panel process
 *   fix(issue, rpc) — IPC-driven, requires a callSceneScript-like RPC dispatcher
 *
 * Issue types (8):
 *   - 'duplicate-name'         — inherited from state-graph
 *   - 'no-states'              — inherited
 *   - 'invalid-selected-index' — inherited
 *   - 'missing-name'           — inherited
 *   - 'orphan-controller'      — inherited (autofix: reset currCtrlId=0)
 *   - 'no-controlled-props'    — inherited
 *   - 'dead-ctrl-data-refs'    — _ctrlData entry whose stateId no longer exists
 *   - 'state-name-collision'   — two states on the same controller share a name
 */

/**
 * @typedef {object} Issue
 * @property {string} type
 * @property {number=} controllerCtrlId
 * @property {string=} nodeUuid
 * @property {number=} stateId
 * @property {('info'|'warning'|'error')} severity
 * @property {boolean} autofix
 * @property {string} suggestedAction
 */

const SEVERITY = Object.freeze({ INFO: 'info', WARNING: 'warning', ERROR: 'error' });

/**
 * @param {object} graph ControllerGraph (output of state-graph.buildControllerGraph)
 * @returns {{issues: Issue[]}}
 */
function detect(graph) {
    const issues = [];
    if (!graph || typeof graph !== 'object') return { issues };

    const ctrlIdSet = new Set((graph.controllers || []).map((c) => c.ctrlId));
    const ctrlById = {};
    for (const c of (graph.controllers || [])) ctrlById[c.ctrlId] = c;

    // ── controller-side anomalies inherited from state-graph ──
    for (const c of (graph.controllers || [])) {
        for (const tag of (c.anomalies || [])) {
            issues.push({
                type: tag,
                controllerCtrlId: c.ctrlId,
                nodeUuid: c.nodeUuid,
                severity: tag === 'duplicate-name' || tag === 'invalid-selected-index'
                    ? SEVERITY.ERROR
                    : SEVERITY.WARNING,
                autofix: false,
                suggestedAction: suggestionFor(tag),
            });
        }
        // state-name-collision: detect duplicate names within same controller
        const seen = Object.create(null);
        for (const st of (c.states || [])) {
            const n = (st && st.name) || '';
            if (n && seen[n]) {
                issues.push({
                    type: 'state-name-collision',
                    controllerCtrlId: c.ctrlId,
                    nodeUuid: c.nodeUuid,
                    stateId: st.stateId,
                    severity: SEVERITY.WARNING,
                    autofix: false,
                    suggestedAction: `Rename one of the states sharing name "${n}".`,
                });
            }
            else if (n) {
                seen[n] = true;
            }
        }
    }

    // ── select-side anomalies ──
    for (const s of (graph.selects || [])) {
        for (const tag of (s.anomalies || [])) {
            issues.push({
                type: tag,
                nodeUuid: s.nodeUuid,
                severity: tag === 'orphan-controller' ? SEVERITY.ERROR : SEVERITY.INFO,
                autofix: tag === 'orphan-controller', // orphan can be auto-reset to 0
                suggestedAction: suggestionFor(tag),
            });
        }
        // dead-ctrl-data-refs: _ctrlData has ctrlIds/stateIds not in scene
        const data = s._ctrlData || {};
        for (const cidKey in data) {
            const cid = Number(cidKey);
            if (!ctrlIdSet.has(cid)) {
                issues.push({
                    type: 'dead-ctrl-data-refs',
                    nodeUuid: s.nodeUuid,
                    severity: SEVERITY.WARNING,
                    autofix: true,
                    suggestedAction: `Remove dangling _ctrlData[${cid}] (controller no longer exists).`,
                });
                continue;
            }
            const ctrl = ctrlById[cid];
            const validStateIds = new Set((ctrl.states || []).map((st) => st.stateId));
            for (const sidKey in data[cidKey]) {
                const sid = Number(sidKey);
                if (!validStateIds.has(sid)) {
                    issues.push({
                        type: 'dead-ctrl-data-refs',
                        nodeUuid: s.nodeUuid,
                        controllerCtrlId: cid,
                        stateId: sid,
                        severity: SEVERITY.WARNING,
                        autofix: true,
                        suggestedAction: `Remove _ctrlData[${cid}][${sid}] (stateId no longer exists on controller).`,
                    });
                }
            }
        }
    }

    return { issues };
}

function suggestionFor(tag) {
    switch (tag) {
        case 'duplicate-name': return 'Rename one of the controllers so each has a unique ctrlName.';
        case 'no-states': return 'Add at least one state to this controller.';
        case 'invalid-selected-index': return 'Reset selectedIndex to 0 (or any in-range value).';
        case 'missing-name': return 'Provide a non-empty ctrlName.';
        case 'orphan-controller': return 'Reset currCtrlId to 0 or pick a valid controller.';
        case 'no-controlled-props': return 'Either remove the StateSelect or declare controlled props.';
        default: return '';
    }
}

/**
 * Apply an autofix by issuing the appropriate scene-accessor RPC.
 *
 * @param {Issue} issue
 * @param {(message: string, payload?: object) => Promise<any>} rpc
 *   A callable that resolves with the RPC reply (panel callers wrap
 *   Editor.Scene.callSceneScript in a Promise).
 */
function fix(issue, rpc) {
    if (!issue || !issue.autofix) return Promise.resolve({ ok: false, reason: 'not-autofixable' });
    if (typeof rpc !== 'function') return Promise.resolve({ ok: false, reason: 'no-rpc' });

    if (issue.type === 'orphan-controller') {
        return rpc('cleanup-orphans', {});
    }
    if (issue.type === 'dead-ctrl-data-refs') {
        // Bulk path covers all dead refs in one snapshot
        return rpc('cleanup-orphans', {});
    }
    return Promise.resolve({ ok: false, reason: 'unsupported-fix' });
}

module.exports = { detect, fix, SEVERITY };
