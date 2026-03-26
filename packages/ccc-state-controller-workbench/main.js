'use strict';

const installer = require('./lib/runtime-installer');
const dataManager = require('./data-manager');

function getProjectPath() {
  return Editor.Project && Editor.Project.path
    ? Editor.Project.path
    : Editor.projectInfo && Editor.projectInfo.path
      ? Editor.projectInfo.path
      : '';
}

function getSelectedDirectory(result) {
  if (Array.isArray(result) && result.length > 0) {
    return result[0];
  }

  if (result && Array.isArray(result.filePaths) && result.filePaths.length > 0) {
    return result.filePaths[0];
  }

  return '';
}

module.exports = {
  load() {},

  unload() {},

  messages: {
    'ccc-state-controller-workbench:open'() {
      Editor.Panel.open('ccc-state-controller-workbench');
    },

    'ccc-state-controller-workbench:close'() {
      Editor.Panel.close('ccc-state-controller-workbench');
    },

    'ccc-state-controller-workbench:init-panel'(event) {
      const projectPath = getProjectPath();
      const sourceDir = installer.getDefaultSourceDir(projectPath);
      const targetDir = dataManager.getLastTargetDir() || sourceDir;

      event.reply(null, {
        projectPath,
        sourceDir,
        targetDir,
        theme: dataManager.getTheme(),
      });
    },

    'ccc-state-controller-workbench:select-target-directory'(event) {
      const projectPath = getProjectPath();
      const result = Editor.Dialog.showOpenDialog({
        title: 'Select Runtime Installation Directory',
        defaultPath: projectPath || '',
        properties: ['openDirectory', 'createDirectory'],
      });
      const targetPath = getSelectedDirectory(result);

      if (targetPath) {
        dataManager.setLastTargetDir(targetPath);
        event.reply(null, { path: targetPath });
        return;
      }

      event.reply(null, null);
    },

    'ccc-state-controller-workbench:get-runtime-status'(event, payload) {
      const projectPath = getProjectPath();
      const status = installer.getRuntimeStatus({
        projectPath,
        sourceDir: payload && payload.sourceDir,
        targetDir: payload && payload.targetDir,
      });
      event.reply(null, status);
    },

    'ccc-state-controller-workbench:install-runtime'(event, payload) {
      const projectPath = getProjectPath();
      const result = installer.installRuntime({
        projectPath,
        sourceDir: payload && payload.sourceDir,
        targetDir: payload && payload.targetDir,
        overwrite: !!(payload && payload.overwrite),
      });

      if (result.success) {
        if (payload && payload.targetDir) {
          dataManager.setLastTargetDir(payload.targetDir);
        }
        Editor.Ipc.sendToAll('assets:refresh');
      }

      event.reply(null, result);
    },

    'ccc-state-controller-workbench:set-theme'(_event, theme) {
      dataManager.setTheme(theme);
    }
  },
};
