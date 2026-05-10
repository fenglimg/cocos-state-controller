'use strict';

const { buildControllerGraph, ANOMALY_TAGS } = require('../../../packages/ccc-state-controller-workbench/lib/state-graph');

describe('lib/state-graph buildControllerGraph', () => {
    test('exposes 6 anomaly tags', () => {
        expect([...ANOMALY_TAGS].sort()).toEqual([
            'duplicate-name',
            'invalid-selected-index',
            'missing-name',
            'no-controlled-props',
            'no-states',
            'orphan-controller',
        ]);
    });

    test('summary aggregates counts correctly for healthy scene', () => {
        const raw = {
            controllers: [
                { ctrlId: 1, ctrlName: 'A', selectedIndex: 0, states: [{ stateId: 1, name: 's1' }, { stateId: 2, name: 's2' }], nodeUuid: 'u1' },
                { ctrlId: 2, ctrlName: 'B', selectedIndex: 0, states: [{ stateId: 5, name: 's5' }], nodeUuid: 'u2' },
            ],
            selects: [
                { nodeUuid: 'u3', currCtrlId: 1, controlledProps: [1, 2, 3] },
                { nodeUuid: 'u4', currCtrlId: 2, controlledProps: [4] },
            ],
        };
        const g = buildControllerGraph(raw);
        expect(g.summary.controllerCount).toBe(2);
        expect(g.summary.selectCount).toBe(2);
        expect(g.summary.orphanSelectCount).toBe(0);
        expect(g.summary.controllersWithIssues).toBe(0);
        expect(g.summary.totalControlledProps).toBe(4);
    });

    test('detects missing-name + duplicate-name anomalies', () => {
        const raw = {
            controllers: [
                { ctrlId: 1, ctrlName: '', selectedIndex: 0, states: [{ stateId: 1, name: 's1' }], nodeUuid: 'u1' },
                { ctrlId: 2, ctrlName: 'shared', selectedIndex: 0, states: [{ stateId: 2, name: 's2' }], nodeUuid: 'u2' },
                { ctrlId: 3, ctrlName: 'shared', selectedIndex: 0, states: [{ stateId: 3, name: 's3' }], nodeUuid: 'u3' },
            ],
            selects: [],
        };
        const g = buildControllerGraph(raw);
        expect(g.controllers[0].anomalies).toContain('missing-name');
        expect(g.controllers[1].anomalies).toContain('duplicate-name');
        expect(g.controllers[2].anomalies).toContain('duplicate-name');
        expect(g.summary.controllersWithIssues).toBe(3);
    });

    test('detects no-states + invalid-selected-index', () => {
        const raw = {
            controllers: [
                { ctrlId: 1, ctrlName: 'noStates', selectedIndex: 0, states: [], nodeUuid: 'u1' },
                { ctrlId: 2, ctrlName: 'bad', selectedIndex: 99, states: [{ stateId: 1, name: 's1' }], nodeUuid: 'u2' },
            ],
            selects: [],
        };
        const g = buildControllerGraph(raw);
        expect(g.controllers[0].anomalies).toContain('no-states');
        expect(g.controllers[1].anomalies).toContain('invalid-selected-index');
    });

    test('detects orphan-controller and no-controlled-props on selects', () => {
        const raw = {
            controllers: [
                { ctrlId: 1, ctrlName: 'A', selectedIndex: 0, states: [{ stateId: 1, name: 's1' }], nodeUuid: 'u1' },
            ],
            selects: [
                { nodeUuid: 'u3', currCtrlId: 999, controlledProps: [1] }, // orphan
                { nodeUuid: 'u4', currCtrlId: 1, controlledProps: [] },    // no-controlled-props
            ],
        };
        const g = buildControllerGraph(raw);
        const orphanSel = g.selects.find((s) => s.nodeUuid === 'u3');
        const emptySel = g.selects.find((s) => s.nodeUuid === 'u4');
        expect(orphanSel.anomalies).toContain('orphan-controller');
        expect(emptySel.anomalies).toContain('no-controlled-props');
        expect(g.summary.orphanSelectCount).toBe(1);
        expect(g.orphanSelects).toHaveLength(1);
    });

    test('handles empty input gracefully', () => {
        const g = buildControllerGraph({});
        expect(g.summary.controllerCount).toBe(0);
        expect(g.summary.selectCount).toBe(0);
        expect(g.controllers).toEqual([]);
        expect(g.orphanSelects).toEqual([]);
    });
});
