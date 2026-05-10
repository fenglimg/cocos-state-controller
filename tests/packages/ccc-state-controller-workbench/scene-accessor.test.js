'use strict';

// IPC contract tests for scene-accessor.js. We don't need a real Cocos engine —
// we mock cc.director, cc.js.getClassName, and Editor.Ipc enough to drive the
// RPC handlers and assert the IPC payload shape.

const path = require('path');

beforeAll(() => {
    if (typeof global.cc === 'undefined') global.cc = {};
    global.cc.js = global.cc.js || {};
    global.cc.js.getClassName = (ctor) => (ctor && ctor.__className) || (ctor && ctor.name) || '';
    global.cc.engine = global.cc.engine || {
        getInstanceById: () => null,
    };
});

function setScene(controllers, selects) {
    const scene = { _components: [], children: [] };
    if (controllers) {
        const ctrlNode = { _components: controllers, children: [], uuid: 'ctrl-host', name: 'ctrlHost' };
        scene.children.push(ctrlNode);
    }
    if (selects) {
        const selNode = { _components: selects, children: [], uuid: 'sel-host', name: 'selHost' };
        scene.children.push(selNode);
    }
    global.cc.director = { getScene: () => scene };
    return scene;
}

function makeController(ctrlId, ctrlName, states, selectedIndex) {
    function C() {
        this.node = { uuid: `n-${ctrlId}`, name: `node-${ctrlId}`, parent: null };
        this.ctrlId = ctrlId;
        this.ctrlName = ctrlName;
        this.states = states;
        this.selectedIndex = selectedIndex;
    }
    C.__className = 'StateController';
    return new C();
}

function makeSelect(currCtrlId, controlledProps) {
    function S() {
        this.node = { uuid: `s-${currCtrlId}`, name: `sel-${currCtrlId}`, parent: null };
        this.currCtrlId = currCtrlId;
        this.controlledProps = controlledProps || [];
        this._ctrlData = {};
    }
    S.__className = 'StateSelect';
    return new S();
}

describe('scene-accessor IPC contracts', () => {
    let accessor;
    let ipcCalls;

    beforeEach(() => {
        ipcCalls = [];
        global.Editor = {
            Ipc: {
                sendRequestToPanel: (target, message, payload) => {
                    ipcCalls.push({ target, message, payload });
                },
            },
            log: () => {},
            warn: () => {},
            error: () => {},
        };
        // Force re-require so module re-binds to the fresh mocks
        delete require.cache[require.resolve('../../../packages/ccc-state-controller-workbench/scene-accessor')];
        accessor = require('../../../packages/ccc-state-controller-workbench/scene-accessor');
    });

    function fakeEvent() {
        const e = { _err: null, _result: null };
        e.reply = (err, result) => { e._err = err; e._result = result; };
        return e;
    }

    test('list-controllers returns a graph with summary, controllers and orphanSelects', () => {
        setScene(
            [makeController(1, 'A', [{ stateId: 11, name: 's1' }], 0)],
            [makeSelect(1, [1, 2]), makeSelect(999, [3])] // 999 is orphan
        );
        const event = fakeEvent();
        accessor['list-controllers'](event);
        expect(event._err).toBeNull();
        expect(event._result.summary.controllerCount).toBe(1);
        expect(event._result.summary.orphanSelectCount).toBe(1);
        expect(event._result.controllers[0].ctrlName).toBe('A');
    });

    test('install-runtime delegates to installer with payload', () => {
        const event = fakeEvent();
        accessor['install-runtime'](event, {
            sourceDir: path.join(__dirname, 'nope-source'),
            targetDir: path.join(__dirname, 'nope-target'),
        });
        expect(event._err).toBeNull();
        // sourceDir does not exist → installer returns failed
        expect(event._result.action).toBe('failed');
    });

    test('set-property-undo-aware sends scene:set-property IPC with id/path/type/value', () => {
        const event = fakeEvent();
        accessor['set-property-undo-aware'](event, { id: 'abc', path: 'selectedIndex', type: 'Number', value: 2 });
        expect(event._err).toBeNull();
        expect(event._result.ok).toBe(true);
        expect(ipcCalls).toHaveLength(1);
        expect(ipcCalls[0].message).toBe('scene:set-property');
        expect(ipcCalls[0].payload).toMatchObject({ id: 'abc', path: 'selectedIndex', type: 'Number', value: 2 });
    });

    test('set-property-undo-aware rejects payload missing required fields', () => {
        const event = fakeEvent();
        accessor['set-property-undo-aware'](event, { id: 'abc' });
        expect(event._err).toBeInstanceOf(Error);
        expect(event._result).toBeNull();
    });

    test('snapshot-begin / snapshot-end emit scene:snapshot IPC', () => {
        const e1 = fakeEvent();
        accessor['snapshot-begin'](e1, { label: 'add-state' });
        const e2 = fakeEvent();
        accessor['snapshot-end'](e2, { label: 'add-state:end' });
        expect(ipcCalls.map((c) => c.message)).toEqual(['scene:snapshot', 'scene:snapshot']);
        expect(ipcCalls[0].payload).toBe('add-state');
        expect(ipcCalls[1].payload).toBe('add-state:end');
    });

    test('exposes M4 + M5 RPC handlers + __internals', () => {
        const handlers = Object.keys(accessor).filter((k) => typeof accessor[k] === 'function');
        expect(handlers).toEqual(expect.arrayContaining([
            // M4
            'list-controllers',
            'install-runtime',
            'get-runtime-status',
            'set-property-undo-aware',
            'snapshot-begin',
            'snapshot-end',
            // M5
            'set-selected-index',
            'set-state-name',
            'set-prop-value',
            'add-state',
            'delete-state',
            'copy-state-props',
            'cleanup-orphans',
            'health-detect',
        ]));
        expect(accessor.__internals).toBeDefined();
    });

    // ─── M5 mutation handlers ───────────────────────────────────────────────

    test('set-selected-index issues scene:set-property with Number type', () => {
        setScene([makeController(1, 'A', [{ stateId: 1, name: 's1' }, { stateId: 2, name: 's2' }], 0)], []);
        const event = fakeEvent();
        accessor['set-selected-index'](event, { ctrlId: 1, newIndex: 1 });
        expect(event._err).toBeNull();
        expect(event._result.ok).toBe(true);
        expect(ipcCalls).toHaveLength(1);
        expect(ipcCalls[0].message).toBe('scene:set-property');
        expect(ipcCalls[0].payload).toMatchObject({ path: 'selectedIndex', type: 'Number', value: 1 });
    });

    test('set-state-name targets _states.<idx>.name path', () => {
        const ctrl = makeController(1, 'A', [{ stateId: 100, name: 'old' }, { stateId: 200, name: 'b' }], 0);
        setScene([ctrl], []);
        const event = fakeEvent();
        accessor['set-state-name'](event, { ctrlId: 1, stateId: 100, newName: 'new' });
        expect(event._err).toBeNull();
        expect(ipcCalls[0].payload.path).toBe('_states.0.name');
        expect(ipcCalls[0].payload.type).toBe('String');
        expect(ipcCalls[0].payload.value).toBe('new');
    });

    test('add-state wraps controller.addState in scene:snapshot begin/end', () => {
        const ctrl = makeController(1, 'A', [], 0);
        let added = null;
        ctrl.addState = (name) => { added = name; };
        setScene([ctrl], []);
        const event = fakeEvent();
        accessor['add-state'](event, { ctrlId: 1, stateName: 'idle' });
        expect(event._err).toBeNull();
        expect(added).toBe('idle');
        const snapshotMessages = ipcCalls.filter((c) => c.message === 'scene:snapshot');
        expect(snapshotMessages).toHaveLength(2);
        expect(snapshotMessages[0].payload).toBe('add-state');
        expect(snapshotMessages[1].payload).toMatch(/add-state:end/);
    });

    test('delete-state wraps controller.deleteState in scene:snapshot begin/end (M3 cascade verified separately)', () => {
        const ctrl = makeController(1, 'A', [{ stateId: 100, name: 'idle' }], 0);
        let deleted = null;
        ctrl.deleteState = (sid) => { deleted = sid; };
        setScene([ctrl], []);
        const event = fakeEvent();
        accessor['delete-state'](event, { ctrlId: 1, stateId: 100 });
        expect(event._err).toBeNull();
        expect(deleted).toBe(100);
        const snapshotMessages = ipcCalls.filter((c) => c.message === 'scene:snapshot');
        expect(snapshotMessages).toHaveLength(2);
    });

    test('copy-state-props writes nested _ctrlData path via scene:set-property and is wrapped in snapshot', () => {
        const ctrl = makeController(1, 'A', [{ stateId: 1, name: 'a' }, { stateId: 2, name: 'b' }], 0);
        const sel = makeSelect(1, [1]);
        sel._ctrlData = { 1: { 1: { '5': 'value-from-a' } } };
        setScene([ctrl], [sel]);
        const event = fakeEvent();
        accessor['copy-state-props'](event, { srcCtrlId: 1, srcStateId: 1, dstStateId: 2 });
        expect(event._err).toBeNull();
        const setPropertyCalls = ipcCalls.filter((c) => c.message === 'scene:set-property');
        expect(setPropertyCalls).toHaveLength(1);
        expect(setPropertyCalls[0].payload.path).toBe('_ctrlData.1.2.5');
    });

    test('set-prop-value validates required fields', () => {
        const event = fakeEvent();
        accessor['set-prop-value'](event, { nodeUuid: 'x' });
        expect(event._err).toBeInstanceOf(Error);
    });

    test('cleanup-orphans returns autofixCount and reset orphan currCtrlId via set-property', () => {
        const ctrl = makeController(1, 'A', [{ stateId: 1, name: 's1' }], 0);
        const orphan = makeSelect(999, [1]);
        setScene([ctrl], [orphan]);
        const event = fakeEvent();
        accessor['cleanup-orphans'](event);
        expect(event._err).toBeNull();
        expect(event._result.autofixCount).toBeGreaterThan(0);
        const propCalls = ipcCalls.filter((c) => c.message === 'scene:set-property');
        const orphanCall = propCalls.find((c) => c.payload && c.payload.path === 'currCtrlId');
        expect(orphanCall).toBeDefined();
        expect(orphanCall.payload.value).toBe(0);
    });

    test('health-detect returns issue list', () => {
        const ctrl = makeController(1, '', [], 0);
        setScene([ctrl], []);
        const event = fakeEvent();
        accessor['health-detect'](event);
        expect(event._err).toBeNull();
        expect(Array.isArray(event._result.issues)).toBe(true);
    });
});
