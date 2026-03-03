/**
 * Jest 配置入口（给 IDE/Jest CLI 自动识别）
 *
 * 注意：tests/ 是隔离依赖环境（jest/ts-jest 安装在 tests/node_modules）。
 * 所以这里保持一个轻量入口，统一复用 `jest.config.local.js`。
 */
module.exports = require('./jest.config.local');
