'use strict';

const { buildControllerGraph } = require('./lib/state-graph');

function getCcRuntime() {
  return typeof cc !== 'undefined' ? cc : null;
}

function getActiveScene() {
  const runtime = getCcRuntime();
  if (!runtime || !runtime.director) {
    return null;
  }

  return runtime.director.getScene();
}

function getComponentClassName(component) {
  const runtime = getCcRuntime();
  if (!component || !component.constructor || !runtime || !runtime.js) {
    return '';
  }
  return runtime.js.getClassName(component.constructor) || '';
}

function walkNodes(node, visitor) {
  if (!node) {
    return;
  }

  visitor(node);
  const children = node.children || [];
  for (const child of children) {
    walkNodes(child, visitor);
  }
}

function getNodePath(node) {
  const names = [];
  let current = node;
  while (current) {
    names.unshift(current.name || 'Unnamed');
    current = current.parent;
  }
  return names.join(' / ');
}

function getNearestParentControllerId(node) {
  let current = node ? node.parent : null;

  while (current) {
    const components = current._components || [];
    for (const component of components) {
      if (getComponentClassName(component) === 'StateController') {
        return component.ctrlId;
      }
    }
    current = current.parent;
  }

  return null;
}

function snapshotController(component) {
  const states = Array.isArray(component.states)
    ? component.states.map((state, index) => ({
      index,
      name: state && state.name ? state.name : `${index + 1}`,
      stateId: state && state.stateId != null ? Number(state.stateId) : index,
    }))
    : [];

  return {
    ctrlId: component.ctrlId,
    ctrlName: component.ctrlName || '',
    selectedIndex: typeof component.selectedIndex === 'number' ? component.selectedIndex : 0,
    selectedPage: component.selectedPage || '',
    nodeUuid: component.node.uuid,
    nodeName: component.node.name,
    nodePath: getNodePath(component.node),
    parentControllerId: getNearestParentControllerId(component.node),
    states,
  };
}

function safeGetControlledProps(component) {
  if (component && typeof component.getControlledProps === 'function') {
    try {
      return component.getControlledProps() || [];
    } catch (_error) {
      return [];
    }
  }
  return [];
}

function snapshotSelect(component) {
  const controlledProps = safeGetControlledProps(component);

  return {
    nodeUuid: component.node.uuid,
    nodeName: component.node.name,
    nodePath: getNodePath(component.node),
    currCtrlId: component.currCtrlId,
    ctrlState: typeof component.ctrlState === 'number' ? component.ctrlState : 0,
    propKey: component.propKey != null ? component.propKey : 0,
    controlledProps,
    controlledPropsCount: controlledProps.length,
  };
}

function collectSceneState() {
  const scene = getActiveScene();
  if (!scene) {
    return buildControllerGraph({
      controllers: [],
      selects: [],
    });
  }

  const controllers = [];
  const selects = [];

  walkNodes(scene, (node) => {
    const components = node._components || [];
    for (const component of components) {
      const className = getComponentClassName(component);
      if (className === 'StateController') {
        controllers.push(snapshotController(component));
      } else if (className === 'StateSelect') {
        selects.push(snapshotSelect(component));
      }
    }
  });

  return buildControllerGraph({ controllers, selects });
}

function getNodeByUuid(uuid) {
  const scene = getActiveScene();
  if (!scene) {
    return null;
  }

  let found = null;
  walkNodes(scene, (node) => {
    if (!found && node.uuid === uuid) {
      found = node;
    }
  });
  return found;
}

function getControllerById(ctrlId) {
  const scene = getActiveScene();
  if (!scene) {
    return null;
  }

  let found = null;
  walkNodes(scene, (node) => {
    if (found) {
      return;
    }
    const components = node._components || [];
    for (const component of components) {
      if (getComponentClassName(component) === 'StateController' && component.ctrlId === ctrlId) {
        found = component;
        break;
      }
    }
  });
  return found;
}

module.exports = {
  'scan-controllers'(event) {
    try {
      event.reply(null, collectSceneState());
    } catch (error) {
      event.reply(error);
    }
  },

  'select-node'(event, nodeUuid) {
    try {
      const node = getNodeByUuid(nodeUuid);
      if (!node) {
        event.reply(new Error(`Node not found: ${nodeUuid}`));
        return;
      }

      Editor.Selection.clear('node');
      Editor.Selection.select('node', node.uuid);
      event.reply(null, { success: true, nodeUuid: node.uuid });
    } catch (error) {
      event.reply(error);
    }
  },

  'set-controller-state'(event, payload) {
    try {
      const ctrlId = payload && payload.ctrlId != null ? Number(payload.ctrlId) : null;
      const stateIndex = payload && payload.stateIndex != null ? Number(payload.stateIndex) : null;
      const controller = getControllerById(ctrlId);

      if (!controller) {
        event.reply(new Error(`Controller not found: ${ctrlId}`));
        return;
      }

      if (stateIndex == null || Number.isNaN(stateIndex)) {
        event.reply(new Error('Invalid state index'));
        return;
      }

      controller.selectedIndex = stateIndex;
      if (typeof controller.refreshSelectedPage === 'function') {
        controller.refreshSelectedPage();
      }
      if (Editor.Ipc && Editor.Ipc.sendToMain) {
        Editor.Ipc.sendToMain('scene:set-dirty');
      }
      event.reply(null, collectSceneState());
    } catch (error) {
      event.reply(error);
    }
  }
};
