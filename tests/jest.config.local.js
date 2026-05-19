/**
 * Jest 配置文件（tests/ 隔离环境专用）
 *
 * 关键点：
 * - rootDir 保持为 tests/，确保可以解析到 tests/node_modules 中的 jest/ts-jest
 * - 通过 moduleNameMapper 将 `assets/*` 映射到项目根目录的 assets/
 * - 支持扫描 tests/core/ 和 tests/packages/ 下的测试文件
 * - 支持扫描 assets/, packages/ccc-state-controller/, packages/ccc-state-controller-core/ 源码
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',

  // 以 tests/ 为 rootDir（隔离依赖所在位置）
  // 扫描 tests/core/ 和 tests/packages/ 下的测试文件
  roots: ['<rootDir>/core', '<rootDir>/packages'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // 覆盖率收集范围（仅项目根 assets/）
  collectCoverageFrom: [
    '../assets/**/*.ts',
    '!../assets/**/*.d.ts',
    '!../assets/**/*.test.ts',
    '!../assets/**/*.spec.ts',
  ],

  // 模块路径映射
  moduleNameMapper: {
    // 绝对路径映射 - 从 tests/ 目录访问项目源码
    '^\\.\\./\\.\\./\\.\\./packages/(.*)$': '<rootDir>/../packages/$1',
    // assets/* 映射到项目根目录
    '^assets/(.*)$': '<rootDir>/../assets/$1',
    // packages/* 映射到项目根目录
    '^packages/(.*)$': '<rootDir>/../packages/$1',
    // Mock 文件
    '^.*/Lib/Decoder/gif-decoder$': '<rootDir>/mocks/gif-decoder.mock.js',
    '^.*/Lib/jssha$': '<rootDir>/mocks/jssha.mock.js',
  },

  // TypeScript 转换配置 - 使用 tests 下的 tsconfig，禁用类型检查（只做转译）
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      isolatedModules: true,
      diagnostics: false,
    }],
  },

  transformIgnorePatterns: [
    'node_modules/(?!(some-esm-package)/)',
  ],

  // 覆盖率输出到 tests/coverage
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  collectCoverage: false,

  setupFiles: [
    'jest-canvas-mock',
    '<rootDir>/env/cocos2d-js-for-preview.js',
    '<rootDir>/env/setup-cocos.ts',
  ],
};
