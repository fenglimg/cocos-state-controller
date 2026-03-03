# 独立测试环境

这是一个完全隔离的测试环境，不会污染项目根目录的配置和依赖。

## 目录结构

```
tests/
├── package.json              # 独立的测试依赖管理
├── jest.config.local.js      # Jest 配置（tests/ 隔离环境主配置）
├── jest.config.js            # Jest 配置入口（转发到 jest.config.local.js，供 IDE/Jest CLI 自动识别）
├── tsconfig.json            # TypeScript 配置（继承根配置）
├── coverage/                # 覆盖率报告输出目录
├── assets/                  # 测试文件目录（镜像源文件结构）
│   └── Script/
│       └── Manager/
│           └── UserInfo/
│               └── __tests__/    # 测试用例
├── env/                     # 测试环境设置
│   ├── cocos2d-js-for-preview.js
│   └── setup-cocos.ts
└── mocks/                   # Mock 文件
    ├── gif-decoder.mock.js
    └── jssha.mock.js
```

## 快速开始

### 1. 安装依赖

```bash
cd tests
npm install
```

### 2. 运行测试

```bash
# 基础测试
npm test

# 生成覆盖率报告
npm run test:coverage

# 监听模式（自动重新运行测试）
npm run test:watch

# 详细输出模式
npm run test:verbose
```

## 可用命令

| 命令 | 说明 |
|------|------|
| `npm test` | 运行所有测试 |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |
| `npm run test:watch` | 监听模式，文件变化时自动运行测试 |
| `npm run test:verbose` | 详细输出模式 |

也可以传递额外的 Jest 参数：

```bash
npm test -- --testNamePattern="UserInfo"    # 只运行包含 UserInfo 的测试
npm test -- --listTests                     # 列出所有测试文件
npm test -- --bail                          # 遇到第一个失败立即停止
```

## 覆盖率报告

运行 `npm run test:coverage` 后，覆盖率报告会生成在 `tests/coverage/` 目录：

- **HTML 报告**: `tests/coverage/lcov-report/index.html` - 在浏览器中打开查看
- **文本报告**: 直接在终端输出
- **LCOV 格式**: `tests/coverage/lcov.info` - 用于 CI/CD 集成
- **JSON 格式**: `tests/coverage/coverage-final.json`

### 覆盖率配置

当前 `tests/jest.config.local.js` **未启用覆盖率阈值**（避免阈值随业务变化频繁波动导致阻塞）。
如需启用，可在 `jest.config.local.js` 中添加 `coverageThreshold` 按目录设置阈值。

**覆盖率报告格式**: text, lcov, html, json

可在 `jest.config.local.js` 中调整阈值和格式。

## 测试目录组织原则

### 镜像源文件结构

测试目录完全镜像项目源文件的目录结构，从 `assets` 开始一一对应。

#### 目录结构对比

```
源文件:
assets/
  Script/
    Manager/
      UserInfo/
        UserInfoManager.ts
        utils/
          RetryStrategy.ts
        cache/
          LRUCache.ts

测试文件:
tests/
  assets/
    Script/
      Manager/
        UserInfo/
          __tests__/
            UserInfoManager.basic.test.ts
            utils/
              RetryStrategy.test.ts
            cache/
              LRUCache.test.ts
```

### 为什么这样组织？

#### ✅ 优点

1. **一一对应**: 测试文件和源文件的目录结构完全对应，易于查找
2. **易于维护**: 重构源文件目录时，测试目录也同步调整
3. **清晰的归属**: 一眼就能看出某个测试文件测试的是哪个源文件
4. **避免冲突**: 不会被 Cocos Creator 加载（在 `tests/` 目录外）

#### ❌ 之前的问题

- 测试文件在 `assets/Script/Manager/UserInfo/__tests__/` 下
- Cocos Creator 会加载这些文件到运行时
- 导致 `jest is not defined` 错误

## 如何添加新测试

### 步骤

假设要为 `assets/Script/Server/Http/Api.ts` 添加测试:

1. **创建对应目录**:
   ```bash
   mkdir -p tests/assets/Script/Server/Http/__tests__
   ```

2. **创建测试文件**:
   ```bash
   touch tests/assets/Script/Server/Http/__tests__/Api.test.ts
   ```

3. **编写测试** (使用绝对路径导入):
   ```typescript
   import { api } from 'assets/Script/Server/Http/Api';

   describe('Api', () => {
     test('should ...', () => {
       // 测试逻辑
     });
   });
   ```

4. **运行测试**:
   ```bash
   cd tests
   npm test
   ```

## 导入路径规范

### ✅ 正确的导入方式

使用 `assets/*` 绝对路径:

```typescript
// 导入被测试的模块
import UserInfoManager from 'assets/Script/Manager/UserInfo/UserInfoManager';
import { api } from 'assets/Script/Server/Http/Api';

// Mock 模块
jest.mock('assets/Script/Core/Logger', () => ({
  default: { info: jest.fn(), error: jest.fn() }
}));
```

### ❌ 错误的导入方式

不要使用相对路径:

```typescript
// ❌ 错误 - 相对路径难以维护
import UserInfoManager from '../../UserInfoManager';
import { api } from '../../../Server/Http/Api';

// ❌ 错误 - jest.mock 也不要使用相对路径
jest.mock('../../../../../../assets/Script/Server/Http/Api', () => ({...}));
```

**注意**: 项目中所有测试文件已统一使用 `assets/*` 绝对路径,包括 `jest.mock` 调用。

## 配置文件说明

### package.json

独立的测试依赖管理，包含：

- `jest`: 测试框架
- `ts-jest`: TypeScript 转换器
- `jest-environment-jsdom`: 浏览器环境模拟
- `jest-canvas-mock`: Canvas API mock
- `@types/jest`: Jest 类型定义

### jest.config.local.js / jest.config.js

Jest 配置文件，当前 tests 目录是**隔离依赖环境**（`jest/ts-jest` 安装在 `tests/node_modules`）。
因此：

- `jest.config.local.js`：**主配置**，以 `tests/` 作为 `rootDir`（确保可以解析到 `tests/node_modules`）
- `jest.config.js`：**入口壳文件**，内容为 `module.exports = require('./jest.config.local')`，避免两份配置漂移

主要配置如下（以 `jest.config.local.js` 为准）：

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  // rootDir 默认为 tests/（隔离依赖所在位置）
  roots: ['<rootDir>/assets'],                // 扫描 tests/assets 下的测试文件
  testMatch: ['**/__tests__/**/*.test.ts'],   // 测试文件匹配模式（镜像源文件结构）

  // 覆盖率配置
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  collectCoverage: false,  // 默认不收集，通过 --coverage 参数开启

  // 模块路径映射
  moduleNameMapper: {
    // 测试 import 一律使用 assets/* 绝对路径（映射到项目根 assets）
    '^assets/(.*)$': '<rootDir>/../assets/$1',
    '^.*/Lib/Decoder/gif-decoder$': '<rootDir>/mocks/gif-decoder.mock.js',
    '^.*/Lib/jssha$': '<rootDir>/mocks/jssha.mock.js',
  },

  // TypeScript 转换配置
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',    // 使用 tests/tsconfig.json（仅转译，不做类型检查）
    }],
  },
};
```

### tsconfig.json

测试专用的 TypeScript 配置，继承根配置：

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["jest", "node"],        // Jest 类型定义
    "noUnusedLocals": false,          // 放宽测试文件的检查
    "noUnusedParameters": false,
    "noImplicitAny": false,
    "baseUrl": ".",
    "paths": {
      "assets/*": ["../assets/*"]     // 路径映射
    }
  },
  "include": [
    "**/*.ts",
    "**/*.d.ts",
    "../assets/**/*.ts",
    "../assets/**/*.d.ts",
    "../types/**/*.d.ts",
    "../assets/Proto/**/*.d.ts",
    "../wepie-proto-static.d.ts"
  ],
  "exclude": [
    "../node_modules",
    "../library",
    "../local",
    "../temp",
    "../build",
    "../settings",
    "../packages"
  ]
}
```

## 特性

✅ **完全隔离** - 不影响根目录的 package.json 和配置文件
✅ **独立依赖** - 测试相关依赖仅安装在 tests/ 目录
✅ **覆盖率报告** - 输出到 tests/coverage/，支持多种格式
✅ **类型安全** - 完整的 TypeScript 支持
✅ **Cocos 环境** - 模拟 Cocos Creator 运行环境
✅ **npm scripts** - 通过 package.json 管理测试命令
✅ **ESLint 隔离** - tests/ 目录被 ESLint 忽略，测试代码有独立规范

## 测试文件命名规范

- 单元测试: `*.test.ts` (例如: `UserInfoManager.test.ts`)
- 集成测试: `*.integration.test.ts`
- 端到端测试: `*.e2e.test.ts`
- 特定功能测试: `*.功能名.test.ts` (例如: `UserInfoManager.basic.test.ts`)

## 故障排除

### 问题: 类型错误（describe, test, expect 等未定义）

**解决方案**:
1. 确保已运行 `cd tests && npm install` 安装依赖
2. TypeScript 使用的是 `tests/tsconfig.json`

### 问题: 测试文件找不到源文件

**解决方案**: 检查导入路径是否使用 `assets/*` 前缀

### 问题: TypeScript 报错找不到模块

**解决方案**: 检查 `tsconfig.json` 中的 `paths` 配置

### 问题: Cocos Creator 仍然报错

**解决方案**: 确保测试文件在 `tests/` 目录下，而不是 `assets/` 目录

### 问题: Cocos 相关错误

测试环境已配置 Cocos2d-js 模拟环境，如遇问题：
1. 检查 `tests/env/cocos2d-js-for-preview.js` 是否正确加载
2. 查看 `tests/env/setup-cocos.ts` 中的初始化逻辑

## 开发建议

1. **编写测试**: 测试文件放在 `tests/assets/` 下，镜像源文件结构
2. **命名规范**: 测试文件以 `.test.ts` 结尾
3. **运行频率**: 开发时使用 `npm run test:watch` 实时反馈
4. **覆盖率**: 定期运行 `npm run test:coverage` 检查覆盖率
5. **导入路径**: 统一使用 `assets/*` 绝对路径

## 注意事项

1. **所有测试文件必须在 `tests/` 目录下**，不要放在 `assets/` 目录
2. **使用 `assets/*` 绝对路径**导入源文件
3. **Mock 外部依赖**时也使用绝对路径
4. **测试文件不会被 Git 忽略**，请放心提交
5. **测试环境与项目根目录完全独立**，修改根目录的 package.json 不会影响测试
6. **覆盖率报告仅包含 `assets/` 目录下的源码**，不包含测试文件
7. **默认不收集覆盖率**（性能考虑），需要时使用 `--coverage` 参数

---

**最后更新**: 2026-02-06