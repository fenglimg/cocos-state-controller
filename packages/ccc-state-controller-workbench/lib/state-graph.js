'use strict';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildControllerGraph(payload) {
  const controllers = ensureArray(payload && payload.controllers).map((controller) => ({
    ...controller,
    ctrlId: controller && controller.ctrlId != null ? Number(controller.ctrlId) : null,
    ctrlName: controller && controller.ctrlName ? controller.ctrlName : '',
    selectedIndex: controller && typeof controller.selectedIndex === 'number' ? controller.selectedIndex : 0,
    states: ensureArray(controller && controller.states).map((state, index) => ({
      index,
      name: state && state.name ? state.name : `${index + 1}`,
      stateId: state && state.stateId != null ? Number(state.stateId) : index,
    })),
  }));

  const selects = ensureArray(payload && payload.selects).map((select) => ({
    ...select,
    currCtrlId: select && select.currCtrlId != null ? Number(select.currCtrlId) : null,
    ctrlState: select && typeof select.ctrlState === 'number' ? select.ctrlState : 0,
    controlledProps: ensureArray(select && select.controlledProps),
    controlledPropsCount: select && typeof select.controlledPropsCount === 'number'
      ? select.controlledPropsCount
      : ensureArray(select && select.controlledProps).length,
  }));

  const duplicateNameMap = new Map();
  for (const controller of controllers) {
    if (!controller.ctrlName) {
      continue;
    }
    duplicateNameMap.set(controller.ctrlName, (duplicateNameMap.get(controller.ctrlName) || 0) + 1);
  }

  const controllerById = new Map(controllers.map((controller) => [controller.ctrlId, controller]));
  const orphanSelects = [];

  for (const controller of controllers) {
    const linkedSelects = selects.filter((select) => select.currCtrlId === controller.ctrlId);
    const anomalies = [];

    if (!controller.ctrlName) {
      anomalies.push('missing-name');
    }
    if (controller.states.length === 0) {
      anomalies.push('no-states');
    }
    if (controller.selectedIndex < 0 || controller.selectedIndex >= controller.states.length) {
      anomalies.push('invalid-selected-index');
    }
    if (controller.ctrlName && duplicateNameMap.get(controller.ctrlName) > 1) {
      anomalies.push('duplicate-name');
    }

    controller.linkedSelects = linkedSelects;
    controller.boundSelectCount = linkedSelects.length;
    controller.controlledPropsTotal = linkedSelects.reduce((sum, select) => sum + select.controlledPropsCount, 0);
    controller.anomalies = anomalies;
    controller.selectedState = controller.states[controller.selectedIndex] || null;
  }

  for (const select of selects) {
    const controller = controllerById.get(select.currCtrlId);
    select.controllerName = controller ? controller.ctrlName : '';
    select.controllerNodePath = controller ? controller.nodePath : '';
    select.anomalies = [];

    if (!controller) {
      select.anomalies.push('orphan-controller');
      orphanSelects.push(select);
    }
    if (select.controlledPropsCount === 0) {
      select.anomalies.push('no-controlled-props');
    }
  }

  const controllersWithIssues = controllers.filter((controller) => controller.anomalies.length > 0).length;
  const totalControlledProps = controllers.reduce((sum, controller) => sum + controller.controlledPropsTotal, 0);

  return {
    summary: {
      controllerCount: controllers.length,
      selectCount: selects.length,
      orphanSelectCount: orphanSelects.length,
      controllersWithIssues,
      totalControlledProps,
    },
    controllers,
    selects,
    orphanSelects,
  };
}

module.exports = {
  buildControllerGraph,
};
