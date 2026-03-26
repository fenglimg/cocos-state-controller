const { buildControllerGraph } = require('packages/ccc-state-controller-workbench/lib/state-graph');

describe('state-graph', () => {
  test('buildControllerGraph aggregates controllers, selects, and anomalies', () => {
    const result = buildControllerGraph({
      controllers: [
        {
          ctrlId: 1,
          ctrlName: 'main',
          selectedIndex: 0,
          nodeName: 'MainNode',
          nodePath: 'Scene / MainNode',
          states: [
            { name: 'Idle', stateId: 101 },
            { name: 'Active', stateId: 102 },
          ],
        },
        {
          ctrlId: 2,
          ctrlName: 'main',
          selectedIndex: 2,
          nodeName: 'BrokenNode',
          nodePath: 'Scene / BrokenNode',
          states: [],
        },
      ],
      selects: [
        {
          nodeUuid: 'a',
          nodeName: 'SelectA',
          nodePath: 'Scene / MainNode / SelectA',
          currCtrlId: 1,
          ctrlState: 0,
          controlledProps: [1, 2],
        },
        {
          nodeUuid: 'b',
          nodeName: 'SelectB',
          nodePath: 'Scene / Orphan',
          currCtrlId: 99,
          ctrlState: 0,
          controlledProps: [],
          controlledPropsCount: 0,
        },
      ],
    });

    expect(result.summary.controllerCount).toBe(2);
    expect(result.summary.selectCount).toBe(2);
    expect(result.summary.orphanSelectCount).toBe(1);
    expect(result.summary.totalControlledProps).toBe(2);

    expect(result.controllers[0].boundSelectCount).toBe(1);
    expect(result.controllers[0].controlledPropsTotal).toBe(2);
    expect(result.controllers[0].selectedState.name).toBe('Idle');
    expect(result.summary.controllersWithIssues).toBe(2);

    expect(result.controllers[1].anomalies).toEqual(
      expect.arrayContaining(['duplicate-name', 'no-states', 'invalid-selected-index']),
    );

    expect(result.orphanSelects).toHaveLength(1);
    expect(result.orphanSelects[0].nodeName).toBe('SelectB');
    expect(result.orphanSelects[0].anomalies).toEqual(
      expect.arrayContaining(['orphan-controller', 'no-controlled-props']),
    );
  });
});
