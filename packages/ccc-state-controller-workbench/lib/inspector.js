'use strict';

/**
 * Reflection-based inspector for StateController / StateSelect runtime instances.
 *
 * Decoupling rule (BOUNDARY-2): this module does NOT import any runtime types.
 * Identification uses cc.js.getClassName(comp.constructor) string match + duck typing.
 *
 * Returned objects are plain JS (no cc references) so they cross IPC safely.
 */

function getClassName(comp) {
    try {
        if (!comp) return '';
        if (typeof cc !== 'undefined' && cc.js && typeof cc.js.getClassName === 'function') {
            return cc.js.getClassName(comp.constructor) || '';
        }
        // Fallback for non-Cocos test envs
        return (comp.constructor && comp.constructor.name) || '';
    } catch (_) {
        return '';
    }
}

function isStateController(comp) {
    return getClassName(comp) === 'StateController';
}

function isStateSelect(comp) {
    return getClassName(comp) === 'StateSelect';
}

function nodePath(node) {
    const segs = [];
    let cur = node;
    let safety = 0;
    while (cur && safety < 64) {
        segs.push(cur.name || '');
        cur = cur.parent;
        safety++;
    }
    return segs.reverse().join('/');
}

/**
 * @param {object} comp StateController instance (duck-typed)
 * @returns {{ctrlId, ctrlName, selectedIndex, states, nodeUuid, nodePath}}
 */
function inspectController(comp) {
    if (!isStateController(comp)) return null;
    const node = comp.node || {};
    const states = Array.isArray(comp.states) ? comp.states.map((s) => ({
        name: (s && s.name) || '',
        stateId: s && s.stateId,
    })) : [];
    return {
        ctrlId: comp.ctrlId,
        ctrlName: comp.ctrlName || comp._ctrlName || '',
        selectedIndex: typeof comp.selectedIndex === 'number' ? comp.selectedIndex : (comp._selectedIndex !== undefined ? comp._selectedIndex : -1),
        states,
        nodeUuid: node.uuid || '',
        nodePath: nodePath(node),
    };
}

/**
 * @param {object} comp StateSelect instance (duck-typed)
 * @returns {{nodeUuid, nodeName, currCtrlId, ctrlState, controlledProps, _ctrlData}}
 */
function inspectSelect(comp) {
    if (!isStateSelect(comp)) return null;
    const node = comp.node || {};
    const controlledProps = Array.isArray(comp.controlledProps) ? comp.controlledProps.slice() : [];
    // Shallow-copy _ctrlData (dictionary of dictionaries) so we don't expose the live structure
    const src = (comp && comp._ctrlData) || {};
    const ctrlData = {};
    for (const cidKey in src) {
        const inner = src[cidKey];
        if (!inner) continue;
        const innerCopy = {};
        for (const sidKey in inner) innerCopy[sidKey] = inner[sidKey];
        ctrlData[cidKey] = innerCopy;
    }
    return {
        nodeUuid: node.uuid || '',
        nodeName: node.name || '',
        currCtrlId: comp.currCtrlId !== undefined ? comp.currCtrlId : (comp._currCtrlId !== undefined ? comp._currCtrlId : 0),
        ctrlState: comp.ctrlState !== undefined ? comp.ctrlState : (comp._ctrlState !== undefined ? comp._ctrlState : -1),
        controlledProps,
        _ctrlData: ctrlData,
    };
}

module.exports = { isStateController, isStateSelect, inspectController, inspectSelect, getClassName };
