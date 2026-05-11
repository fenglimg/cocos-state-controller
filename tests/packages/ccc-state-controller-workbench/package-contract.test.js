'use strict';

const packageJson = require('../../../packages/ccc-state-controller-workbench/package.json');

describe('ccc-state-controller-workbench package contract', () => {
    test('declares panel IPC messages used by the workbench', () => {
        expect(packageJson.panel).toBeDefined();
        expect(packageJson.panel.messages).toEqual(expect.arrayContaining([
            'list-controllers',
            'health-detect',
        ]));
    });
});
