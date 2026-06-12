/**
 * Jest 配置 — csc CLI 单测专用（纯 node 逻辑，不碰 cocos/jsdom/ts-jest）。
 *
 * CLI 源码在项目根 lib/（CommonJS），测试在 tests/cli/*.test.js。
 * 与主 suite（core/panel，ts-jest+jsdom）完全隔离，互不影响 660 绿基线。
 * 跑法：cd tests && npx jest -c jest.config.cli.js
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: __dirname,
  roots: ['<rootDir>/cli'],
  testMatch: ['**/*.test.js'],
  moduleFileExtensions: ['js', 'json', 'node'],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testTimeout: 10000,
};
