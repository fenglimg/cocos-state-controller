'use strict';

const inspector = require('../../../packages/ccc-state-controller-workbench/lib/inspector');

// Mock cc.js.getClassName so reflection works without a real engine env.
beforeAll(() => {
    if (typeof global.cc === 'undefined') global.cc = {};
    global.cc.js = global.cc.js || {};
    global.cc.js.getClassName = (ctor) => (ctor && ctor.__className) || (ctor && ctor.name) || '';
});

function makeFakeController() {
    const node = { uuid: 'node-1', name: 'CtrlNode', parent: null };
    function FakeController() {
        this.node = node;
        this.ctrlId = 7;
        this.ctrlName = 'Hero';
        this.selectedIndex = 1;
        this.states = [
            { stateId: 100, name: 'idle' },
            { stateId: 200, name: 'run' },
        ];
    }
    FakeController.__className = 'StateController';
    return new FakeController();
}

function makeFakeSelect() {
    const node = { uuid: 'node-2', name: 'SelectNode', parent: null };
    function FakeSelect() {
        this.node = node;
        this.currCtrlId = 7;
        this.ctrlState = 1;
        this.controlledProps = [1, 5, 10];
        this._ctrlData = { 7: { 100: { 1: true } } };
    }
    FakeSelect.__className = 'StateSelect';
    return new FakeSelect();
}

describe('lib/inspector', () => {
    test('isStateController matches by class name string', () => {
        const ctrl = makeFakeController();
        expect(inspector.isStateController(ctrl)).toBe(true);
        expect(inspector.isStateSelect(ctrl)).toBe(false);
    });

    test('inspectController returns 6 expected fields', () => {
        const c = inspector.inspectController(makeFakeController());
        expect(c).toHaveProperty('ctrlId', 7);
        expect(c).toHaveProperty('ctrlName', 'Hero');
        expect(c).toHaveProperty('selectedIndex', 1);
        expect(c.states).toHaveLength(2);
        expect(c).toHaveProperty('nodeUuid', 'node-1');
        expect(c).toHaveProperty('nodePath');
    });

    test('inspectSelect returns expected fields and shallow-copies _ctrlData', () => {
        const s = inspector.inspectSelect(makeFakeSelect());
        expect(s).toHaveProperty('currCtrlId', 7);
        expect(s).toHaveProperty('ctrlState', 1);
        expect(s.controlledProps).toEqual([1, 5, 10]);
        expect(s._ctrlData[7][100][1]).toBe(true);
    });

    test('inspectController returns null for non-controller comp', () => {
        const fake = { constructor: { name: 'Other' } };
        expect(inspector.inspectController(fake)).toBeNull();
    });
});
