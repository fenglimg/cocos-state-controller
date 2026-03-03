/**
 * Jest Configuration for Installer Module Unit Tests
 *
 * This configuration is specifically for testing the installer sub-modules:
 * - version-manager.js
 * - file-copier.js
 * - validator.js
 *
 * These tests follow Pure Logic Strategy from TESTING_GUIDE.md
 */

module.exports = {
    testEnvironment: 'node',

    // Test files location
    roots: ['<rootDir>/packages/ccc-state-controller/tests'],
    testMatch: [
        '**/*.test.js',
        '!**/installer.test.js' // Exclude the custom runner test
    ],

    // Module file extensions
    moduleFileExtensions: ['js', 'json', 'node'],

    // Coverage configuration
    collectCoverageFrom: [
        'packages/ccc-state-controller/src/installer/**/*.js',
        '!packages/ccc-state-controller/src/installer/index.js', // Integration tests cover this
    ],

    coverageDirectory: '<rootDir>/packages/ccc-state-controller/tests/coverage',
    coverageReporters: ['text', 'lcov', 'html', 'json'],
    collectCoverage: false,

    // Clear mocks between tests
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,

    // Verbose output
    verbose: true,

    // Timeout
    testTimeout: 10000,
};
