'use strict';

const PKG_NAME = 'ccc-state-controller-workbench';

module.exports = {
    load() {},
    unload() {},
    messages: {
        'open'() {
            Editor.Panel.open(PKG_NAME);
        },
        'close'() {
            Editor.Panel.close(PKG_NAME);
        },
    },
};
