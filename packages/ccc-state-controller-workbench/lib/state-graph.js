'use strict';

/**
 * Pure-logic module: build a graph snapshot of all StateController + StateSelect
 * components in the scene, plus anomaly detection.
 *
 * Input is a plain JS object (collected via inspector.js), output is also plain JS
 * so it is safe to transmit across IPC boundaries (panel <-> scene processes).
 *
 * Anomaly tags (6):
 *   - 'duplicate-name'           — multiple controllers share the same ctrlName
 *   - 'no-states'                — controller.states is empty
 *   - 'invalid-selected-index'   — selectedIndex out of range
 *   - 'missing-name'             — ctrlName is empty/whitespace
 *   - 'orphan-controller'        — StateSelect.currCtrlId points to a missing controller
 *   - 'no-controlled-props'      — StateSelect declares no controlled props
 *
 * (M5 health-check.js will extend with additional issue types and autofix metadata.)
 */

/**
 * @param {{controllers: Array, selects: Array}} raw
 *   controllers: [{ ctrlId, ctrlName, selectedIndex, states, nodeUuid, nodePath }]
 *   selects:     [{ nodeUuid, nodeName, currCtrlId, ctrlState, controlledProps, _ctrlData }]
 * @returns {{summary, controllers, orphanSelects}}
 */
function buildControllerGraph(raw) {
    const controllers = Array.isArray(raw && raw.controllers) ? raw.controllers : [];
    const selects = Array.isArray(raw && raw.selects) ? raw.selects : [];

    const ctrlIdSet = new Set(controllers.map((c) => c && c.ctrlId));
    const ctrlNameCount = Object.create(null);
    for (const c of controllers) {
        if (!c) continue;
        const name = c.ctrlName || '';
        ctrlNameCount[name] = (ctrlNameCount[name] || 0) + 1;
    }

    let totalControlledProps = 0;
    let controllersWithIssues = 0;
    let orphanSelectCount = 0;

    const enrichedControllers = controllers.map((c) => {
        const anomalies = [];
        if (!c.ctrlName || String(c.ctrlName).trim() === '') anomalies.push('missing-name');
        if (c.ctrlName && ctrlNameCount[c.ctrlName] > 1) anomalies.push('duplicate-name');
        if (!Array.isArray(c.states) || c.states.length === 0) anomalies.push('no-states');
        else if (typeof c.selectedIndex === 'number' && (c.selectedIndex < 0 || c.selectedIndex >= c.states.length)) {
            anomalies.push('invalid-selected-index');
        }
        if (anomalies.length > 0) controllersWithIssues++;
        return Object.assign({}, c, { anomalies });
    });

    const orphanSelects = [];
    const enrichedSelects = selects.map((s) => {
        const anomalies = [];
        const cid = s.currCtrlId;
        const orphan = cid !== undefined && cid !== null && cid !== 0 && !ctrlIdSet.has(cid);
        if (orphan) {
            anomalies.push('orphan-controller');
            orphanSelectCount++;
        }
        const propCount = Array.isArray(s.controlledProps) ? s.controlledProps.length : 0;
        if (propCount === 0) anomalies.push('no-controlled-props');
        totalControlledProps += propCount;
        const enriched = Object.assign({}, s, { anomalies });
        if (orphan) orphanSelects.push(enriched);
        return enriched;
    });

    return {
        summary: {
            controllerCount: controllers.length,
            selectCount: selects.length,
            orphanSelectCount,
            totalControlledProps,
            controllersWithIssues,
        },
        controllers: enrichedControllers,
        selects: enrichedSelects,
        orphanSelects,
    };
}

const ANOMALY_TAGS = Object.freeze([
    'duplicate-name',
    'no-states',
    'invalid-selected-index',
    'missing-name',
    'orphan-controller',
    'no-controlled-props',
]);

module.exports = { buildControllerGraph, ANOMALY_TAGS };
