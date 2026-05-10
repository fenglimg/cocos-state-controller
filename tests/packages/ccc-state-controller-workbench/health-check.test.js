'use strict';

const healthCheck = require('../../../packages/ccc-state-controller-workbench/lib/health-check');
const stateGraph = require('../../../packages/ccc-state-controller-workbench/lib/state-graph');

function buildGraph(controllers, selects) {
    return stateGraph.buildControllerGraph({ controllers, selects });
}

describe('lib/health-check', () => {
    test('detect returns issues for every state-graph anomaly', () => {
        const graph = buildGraph(
            [
                { ctrlId: 1, ctrlName: '', selectedIndex: 0, states: [{ stateId: 1, name: 's1' }], nodeUuid: 'u1' }, // missing-name
                { ctrlId: 2, ctrlName: 'shared', selectedIndex: 99, states: [{ stateId: 2, name: 's2' }], nodeUuid: 'u2' }, // duplicate + invalid-selected-index
                { ctrlId: 3, ctrlName: 'shared', selectedIndex: 0, states: [], nodeUuid: 'u3' }, // duplicate + no-states
            ],
            [
                { nodeUuid: 's-orphan', currCtrlId: 999, controlledProps: [1] },
                { nodeUuid: 's-empty', currCtrlId: 1, controlledProps: [] },
            ]
        );
        const { issues } = healthCheck.detect(graph);
        const types = issues.map((i) => i.type);
        expect(types).toEqual(expect.arrayContaining([
            'missing-name',
            'duplicate-name',
            'invalid-selected-index',
            'no-states',
            'orphan-controller',
            'no-controlled-props',
        ]));
    });

    test('detect flags state-name-collision within a single controller', () => {
        const graph = buildGraph(
            [{ ctrlId: 1, ctrlName: 'A', selectedIndex: 0, states: [
                { stateId: 1, name: 'idle' },
                { stateId: 2, name: 'idle' },
            ], nodeUuid: 'u1' }],
            []
        );
        const { issues } = healthCheck.detect(graph);
        const collision = issues.find((i) => i.type === 'state-name-collision');
        expect(collision).toBeDefined();
        expect(collision.controllerCtrlId).toBe(1);
        expect(collision.severity).toBe('warning');
    });

    test('detect flags dead-ctrl-data-refs when stateId no longer exists', () => {
        const graph = buildGraph(
            [{ ctrlId: 1, ctrlName: 'A', selectedIndex: 0, states: [{ stateId: 100, name: 's100' }], nodeUuid: 'u1' }],
            [{ nodeUuid: 'sel-1', currCtrlId: 1, controlledProps: [1], _ctrlData: { 1: { 100: { 1: true }, 999: { 1: false } } } }]
        );
        const { issues } = healthCheck.detect(graph);
        const dead = issues.filter((i) => i.type === 'dead-ctrl-data-refs');
        expect(dead.length).toBe(1);
        expect(dead[0].stateId).toBe(999);
        expect(dead[0].autofix).toBe(true);
    });

    test('detect flags dead-ctrl-data-refs when ctrlId itself is missing', () => {
        const graph = buildGraph(
            [{ ctrlId: 1, ctrlName: 'A', selectedIndex: 0, states: [{ stateId: 100, name: 's100' }], nodeUuid: 'u1' }],
            [{ nodeUuid: 'sel-1', currCtrlId: 1, controlledProps: [1], _ctrlData: { 7: { 999: { 1: true } } } }]
        );
        const { issues } = healthCheck.detect(graph);
        const dead = issues.find((i) => i.type === 'dead-ctrl-data-refs');
        expect(dead).toBeDefined();
        expect(dead.autofix).toBe(true);
    });

    test('orphan-controller is autofix=true', () => {
        const graph = buildGraph(
            [{ ctrlId: 1, ctrlName: 'A', selectedIndex: 0, states: [{ stateId: 1, name: 's1' }], nodeUuid: 'u1' }],
            [{ nodeUuid: 'sel-x', currCtrlId: 999, controlledProps: [1] }]
        );
        const { issues } = healthCheck.detect(graph);
        const orphan = issues.find((i) => i.type === 'orphan-controller');
        expect(orphan).toBeDefined();
        expect(orphan.autofix).toBe(true);
        expect(orphan.severity).toBe('error');
    });

    test('detect handles empty graph', () => {
        const graph = buildGraph([], []);
        const { issues } = healthCheck.detect(graph);
        expect(issues).toEqual([]);
    });

    test('detect identifies at least 8 distinct issue types overall', () => {
        // Spread issues across multiple graphs to show all 8 types are reachable
        const graphAll = buildGraph(
            [
                { ctrlId: 1, ctrlName: '', selectedIndex: 0, states: [], nodeUuid: 'u1' }, // missing-name + no-states
                { ctrlId: 2, ctrlName: 'X', selectedIndex: 0, states: [
                    { stateId: 1, name: 'a' }, { stateId: 2, name: 'a' }, // collision
                ], nodeUuid: 'u2' },
                { ctrlId: 3, ctrlName: 'Y', selectedIndex: 99, states: [{ stateId: 5, name: 'b' }], nodeUuid: 'u3' }, // invalid-selected-index
                { ctrlId: 4, ctrlName: 'dup', selectedIndex: 0, states: [{ stateId: 7, name: 'c' }], nodeUuid: 'u4' },
                { ctrlId: 5, ctrlName: 'dup', selectedIndex: 0, states: [{ stateId: 9, name: 'd' }], nodeUuid: 'u5' }, // duplicate-name
            ],
            [
                { nodeUuid: 'sel-orph', currCtrlId: 999, controlledProps: [1] }, // orphan-controller
                { nodeUuid: 'sel-empty', currCtrlId: 4, controlledProps: [] },     // no-controlled-props
                { nodeUuid: 'sel-dead', currCtrlId: 4, controlledProps: [1], _ctrlData: { 4: { 999: {} } } }, // dead-ctrl-data-refs
            ]
        );
        const { issues } = healthCheck.detect(graphAll);
        const types = new Set(issues.map((i) => i.type));
        expect(types.size).toBeGreaterThanOrEqual(8);
    });

    test('fix delegates to cleanup-orphans RPC for autofix issues', async () => {
        const calls = [];
        const rpc = (msg, payload) => {
            calls.push({ msg, payload });
            return Promise.resolve({ ok: true });
        };
        await healthCheck.fix({ type: 'orphan-controller', autofix: true, nodeUuid: 'x', severity: 'error', suggestedAction: '' }, rpc);
        await healthCheck.fix({ type: 'dead-ctrl-data-refs', autofix: true, nodeUuid: 'y', severity: 'warning', suggestedAction: '' }, rpc);
        expect(calls.map((c) => c.msg)).toEqual(['cleanup-orphans', 'cleanup-orphans']);
    });

    test('fix returns ok:false for non-autofixable issues', async () => {
        const result = await healthCheck.fix({ type: 'duplicate-name', autofix: false, severity: 'error', suggestedAction: '' }, () => Promise.resolve({}));
        expect(result.ok).toBe(false);
    });
});
