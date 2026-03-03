# 实施计划 - 状态控制器优化与编辑器集成

## 概述

**会话**: WFS-state-controller-optimization
**来源**: BS-state-controller-optimization-2026-03-02
**目标**: 实现状态控制器优化和编辑器集成安装功能

---

## Phase 1: 核心性能优化 (Week 1)

### IMPL-001: BFS缓存优化
**优先级**: P0 | **工作量**: 2-3天 | **风险**: 低

**目标**: 将状态切换时的O(n)遍历优化为O(1)缓存查找

**任务清单**:
- [ ] IMPL-001.1: 添加缓存属性 `_stateSelectCache` 和 `_cacheDirty`
- [ ] IMPL-001.2: 实现 `rebuildStateSelectCache()` 方法
- [ ] IMPL-001.3: 实现 `isDirectlyControlled()` 辅助方法
- [ ] IMPL-001.4: 修改 `updateState()` 使用缓存
- [ ] IMPL-001.5: 添加 `markCacheDirty()` 公共方法
- [ ] IMPL-001.6: 在 StateSelect 中添加缓存失效通知

**修改文件**:
- `assets/script/Controller/StateController.ts`
- `assets/script/Controller/StateSelect.ts`

---

### IMPL-002: selectedPage修复
**优先级**: P0 | **工作量**: 0.5天 | **风险**: 低

**目标**: 解决"设置状态时selectedPage不会及时更新"的问题

**任务清单**:
- [ ] IMPL-002.1: 在 `selectedIndex` setter 中触发 `_emitSelectedPageChanged()`
- [ ] IMPL-002.2: 实现 `_emitSelectedPageChanged()` 方法
- [ ] IMPL-002.3: 添加 `refreshSelectedPage()` 公共方法
- [ ] IMPL-002.4: 添加调试日志到 `selectedPage` getter

**修改文件**:
- `assets/script/Controller/StateController.ts`

---

### IMPL-003: 智能属性推断
**优先级**: P1 | **工作量**: 2-3天 | **风险**: 低

**目标**: 根据节点现有组件自动推荐可控制的属性

**任务清单**:
- [ ] IMPL-003.1: 实现 `scanAvailableProperties()` 方法
- [ ] IMPL-003.2: 实现 `isPropertyAvailable()` 方法
- [ ] IMPL-003.3: 实现 `autoConfigureAllProperties()` 方法
- [ ] IMPL-003.4: 实现 `isPropertyControlled()` 方法
- [ ] IMPL-003.5: 实现 `togglePropertyControl()` 方法
- [ ] IMPL-003.6: 在 StateToolsProps 中添加"自动配置"按钮

**修改文件**:
- `assets/script/Controller/StateSelect.ts`
- `assets/script/Controller/Props/StateToolsProps.ts`

---

## Phase 2: 功能增强 (Week 2)

### IMPL-004: 属性监听器系统
**优先级**: P1 | **工作量**: 2-4天 | **风险**: 中

**目标**: 解决"属性只能从PropValue设置没有监听方法"的问题

**任务清单**:
- [ ] IMPL-004.1: 添加 `_autoSyncEnabled` 配置属性
- [ ] IMPL-004.2: 添加 `_syncInterval` 间隔配置
- [ ] IMPL-004.3: 实现 `startPropertyWatch()` 方法
- [ ] IMPL-004.4: 实现 `stopPropertyWatch()` 方法
- [ ] IMPL-004.5: 实现 `checkPropertyChanges()` 方法
- [ ] IMPL-004.6: 实现 `getControlledProps()` 方法
- [ ] IMPL-004.7: 实现 `onPropertyExternallyChanged()` 方法
- [ ] IMPL-004.8: 实现 `updatePropertySnapshot()` 方法
- [ ] IMPL-004.9: 实现辅助方法 `deepEqualValue()`, `cloneValue()`, `formatValue()`
- [ ] IMPL-004.10: 在生命周期 `onLoad`/`onDestroy` 中集成监听

**修改文件**:
- `assets/script/Controller/StateSelect.ts`

---

### IMPL-005: 数据结构优化
**优先级**: P2 | **工作量**: 3-5天 | **风险**: 中

**目标**: 简化三层嵌套的 `_ctrlData` 结构，提升访问效率

**任务清单**:
- [ ] IMPL-005.1: 设计扁平化数据结构 `FlatStateData` 接口
- [ ] IMPL-005.2: 添加 `_flatData` Map 属性
- [ ] IMPL-005.3: 实现 `makeKey()` 组合键生成方法
- [ ] IMPL-005.4: 实现 `getPropValueFast()` 快速获取
- [ ] IMPL-005.5: 实现 `setPropValueFast()` 快速设置
- [ ] IMPL-005.6: 实现 `migrateFromLegacyData()` 数据迁移
- [ ] IMPL-005.7: 修改 `getPropData()` 兼容新结构

**修改文件**:
- `assets/script/Controller/StateSelect.ts`

---

### IMPL-006: 单元测试
**优先级**: P2 | **工作量**: 3-5天 | **风险**: 低

**目标**: 补充核心功能的单元测试，确保重构安全性

**任务清单**:
- [ ] IMPL-006.1: 创建测试目录结构
- [ ] IMPL-006.2: StateController 测试 - 状态管理
- [ ] IMPL-006.3: StateController 测试 - BFS缓存机制
- [ ] IMPL-006.4: StateController 测试 - 状态操作
- [ ] IMPL-006.5: StateSelect 测试 - 智能属性推断
- [ ] IMPL-006.6: StateSelect 测试 - 属性监听器
- [ ] IMPL-006.7: StateSelect 测试 - 数据结构
- [ ] IMPL-006.8: StatePropHandler 测试 - 处理器注册与调用

**新增文件**:
- `assets/script/Controller/__tests__/StateController.test.ts`
- `assets/script/Controller/__tests__/StateSelect.test.ts`
- `assets/script/Controller/__tests__/StatePropHandler.test.ts`

---

## Phase 3: 编辑器扩展 (Week 3-4)

### IMPL-007: 核心源码包结构
**优先级**: P1 | **工作量**: 1天 | **风险**: 低

**目标**: 创建 ccc-state-controller-core 源码包结构

**任务清单**:
- [ ] IMPL-007.1: 创建 `packages/ccc-state-controller-core/` 目录
- [ ] IMPL-007.2: 创建 `package.json` 版本信息
- [ ] IMPL-007.3: 复制源码到 `src/` 目录
- [ ] IMPL-007.4: 创建源码单元测试目录

**新增文件**:
- `packages/ccc-state-controller-core/package.json`
- `packages/ccc-state-controller-core/src/*` (复制)

---

### IMPL-008: 安装器核心模块
**优先级**: P1 | **工作量**: 2-3天 | **风险**: 低

**目标**: 实现源码安装的核心功能

**任务清单**:
- [ ] IMPL-008.1: 创建安装器目录结构
- [ ] IMPL-008.2: 实现 `installer/version-manager.js` 版本管理
- [ ] IMPL-008.3: 实现 `installer/file-copier.js` 文件复制
- [ ] IMPL-008.4: 实现 `installer/validator.js` 安装验证
- [ ] IMPL-008.5: 实现 `installer/index.js` 主入口
- [ ] IMPL-008.6: 创建版本文件模板 `.ccc-state-controller-version`

**新增文件**:
- `packages/ccc-state-controller/src/installer/*.js`

---

### IMPL-009: 扩展面板UI
**优先级**: P1 | **工作量**: 2-3天 | **风险**: 低

**目标**: 使用 /ui-ux-pro-max 设计并实现安装面板

**任务清单**:
- [ ] IMPL-009.1: 调用 /ui-ux-pro-max 生成UI设计方案
- [ ] IMPL-009.2: 实现面板 HTML 模板
- [ ] IMPL-009.3: 实现面板 CSS 样式
- [ ] IMPL-009.4: 实现面板交互逻辑
- [ ] IMPL-009.5: 集成安装器 IPC 调用

**修改文件**:
- `packages/ccc-state-controller/panel/index.js`
- `packages/ccc-state-controller/main.js`

---

### IMPL-010: 集成测试
**优先级**: P2 | **工作量**: 2天 | **风险**: 低

**目标**: 预留源码集成测试功能

**任务清单**:
- [ ] IMPL-010.1: 创建测试目录 `tests/`
- [ ] IMPL-010.2: 实现 `installer.test.js` 安装器测试
- [ ] IMPL-010.3: 创建测试 fixtures
- [ ] IMPL-010.4: 实现测试辅助函数

**新增文件**:
- `packages/ccc-state-controller/tests/*.js`
- `packages/ccc-state-controller/tests/fixtures/*`

---

## 依赖关系

```
IMPL-001 (BFS缓存) ──┐
IMPL-002 (selectedPage) ├──→ IMPL-006 (单元测试)
IMPL-003 (智能推断) ──┤
IMPL-004 (属性监听) ──┤
IMPL-005 (数据结构) ──┘

IMPL-007 (核心包) ──→ IMPL-008 (安装器) ──→ IMPL-009 (UI面板)
                                        └──→ IMPL-010 (集成测试)
```

---

## 里程碑

| 里程碑 | 任务 | 预计完成 |
|--------|------|----------|
| M1: 性能优化 | IMPL-001, 002, 003 | Week 1 |
| M2: 功能增强 | IMPL-004, 005, 006 | Week 2 |
| M3: 编辑器集成 | IMPL-007, 008, 009, 010 | Week 3-4 |

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 向后兼容破坏 | 高 | 保留旧数据读取逻辑，渐进迁移 |
| 编辑器API限制 | 中 | 使用 setTimeout workaround，预留降级方案 |
| 测试覆盖不足 | 中 | 优先覆盖核心路径，边界测试后补 |
