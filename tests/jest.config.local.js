/**
 * Jest 配置文件（tests/ 隔离环境专用）
 *
 * 关键点：
 * - rootDir 保持为 tests/，确保可以解析到 tests/node_modules 中的 jest/ts-jest
 * - 通过 moduleNameMapper 将 `assets/*` 映射到项目根目录的 assets/
 * - 支持扫描 tests/core/ 下的测试文件 (tests/packages/ 在 M1 已清空，将在 M4 重建)
 * - 支持扫描 assets/script/controller/, packages/ccc-state-controller/ 源码
 * - phantom 子包 ccc-state-controller-core/src/* 通过 moduleNameMapper 重定向至 assets/script/controller/
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',

  // 以 tests/ 为 rootDir（隔离依赖所在位置）
  // 扫描 tests/core/ (TS) 与 tests/packages/ (JS) 下的测试文件
  roots: ['<rootDir>/core', '<rootDir>/packages'],
  testMatch: ['**/*.test.ts', '**/*.test.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // 覆盖率收集范围（项目根 assets + packages）
  collectCoverageFrom: [
    '../assets/**/*.ts',
    '../packages/ccc-state-controller/**/*.ts',
    '../packages/ccc-state-controller-workbench/**/*.js',
    '!../assets/**/*.d.ts',
    '!../assets/**/*.test.ts',
    '!../assets/**/*.spec.ts',
    '!../packages/**/*.d.ts',
    '!../packages/**/*.test.ts',
    '!../packages/**/*.spec.ts',
  ],

  // 模块路径映射
  moduleNameMapper: {
    // Phantom package redirect: ccc-state-controller-core/src/* → assets/script/controller/*
    // 该子包并不存在于物理文件系统中，遗留测试 import 路径通过此映射解析到真实源码
    '^.*ccc-state-controller-core/src/(.*)$': '<rootDir>/../assets/script/controller/$1',
    // 绝对路径映射 - 从 tests/ 目录访问项目源码
    '^\\.\\./\\.\\./\\.\\./packages/(.*)$': '<rootDir>/../packages/$1',
    // 旧式 ../../../assets/... 写法兼容（测试文件实际深度只需 ../../ ，但保留三段以兼容现有约定）
    '^\\.\\./\\.\\./\\.\\./assets/(.*)$': '<rootDir>/../assets/$1',
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
