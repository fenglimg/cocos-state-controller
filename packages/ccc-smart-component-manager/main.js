'use strict';

module.exports = {
  load() {

  },

  unload() {
  },

  messages: {
    'open'() {
      // open entry panel registered in package.json
      Editor.Panel.open('ccc-smart-component-manager');
    },
    'close'() {
      Editor.Panel.close('ccc-smart-component-manager');
    },

  },
};