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

    test('exposes 6 RPC handlers + __internals', () => {
        const handlers = Object.keys(accessor).filter((k) => typeof accessor[k] === 'function');
        expect(handlers).toEqual(expect.arrayContaining([
            'list-controllers',
            'install-runtime',
            'get-runtime-status',
            'set-property-undo-aware',
            'snapshot-begin',
            'snapshot-end',
        ]));
        expect(accessor.__internals).toBeDefined();
    });
});
