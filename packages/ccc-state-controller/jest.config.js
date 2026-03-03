/**
 * Jest Configuration for ccc-state-controller package tests
 *
 * Test Environment: jsdom for DOM testing
 * Test Framework: Jest with JavaScript (no TypeScript)
 */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  moduleFileExtensions: ['js', 'json', 'node'],

  // Module path mapping for Editor mock
  moduleNameMapper: {
    '^Editor$': '<rootDir>/tests/__mocks__/Editor.js',
  },

  // Don't use preset, plain JavaScript tests
  transform: {},

  // Coverage configuration
  collectCoverageFrom: [
    'panel/**/*.js',
    'src/**/*.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: '<rootDir>/tests/coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Test timeout
  testTimeout: 10000,

  // Verbose output
  verbose: true,
};
