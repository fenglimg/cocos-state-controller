# TODO List - WFS-state-controller-optimization

## Phase 1: 核心性能优化 (Week 1)

### IMPL-001: BFS缓存优化 [P0]
- [x] IMPL-001.1: 添加缓存属性 `_stateSelectCache` 和 `_cacheDirty`
- [x] IMPL-001.2: 实现 `rebuildStateSelectCache()` 方法
- [x] IMPL-001.3: 实现 `isDirectlyControlled()` 辅助方法
- [x] IMPL-001.4: 修改 `updateState()` 使用缓存
- [x] IMPL-001.5: 添加 `markCacheDirty()` 公共方法
- [x] IMPL-001.6: 在 StateSelect 中添加缓存失效通知

### IMPL-002: selectedPage修复 [P0]
- [x] IMPL-002.1: 在 `selectedIndex` setter 中触发 `_emitSelectedPageChanged()`
- [x] IMPL-002.2: 实现 `_emitSelectedPageChanged()` 方法
- [x] IMPL-002.3: 添加 `refreshSelectedPage()` 公共方法
- [x] IMPL-002.4: 添加调试日志到 `selectedPage` getter

### IMPL-003: 智能属性推断 [P1]
- [ ] IMPL-003.1: 实现 `scanAvailableProperties()` 方法
- [ ] IMPL-003.2: 实现 `isPropertyAvailable()` 方法
- [ ] IMPL-003.3: 实现 `autoConfigureAllProperties()` 方法
- [ ] IMPL-003.4: 实现 `isPropertyControlled()` 方法
- [ ] IMPL-003.5: 实现 `togglePropertyControl()` 方法
- [ ] IMPL-003.6: 在 StateToolsProps 中添加"自动配置"按钮

---

## Phase 2: 功能增强 (Week 2)

### IMPL-004: 属性监听器系统 [P1]
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

### IMPL-005: 数据结构优化 [P2]
- [ ] IMPL-005.1: 设计扁平化数据结构 `FlatStateData` 接口
- [ ] IMPL-005.2: 添加 `_flatData` Map 属性
- [ ] IMPL-005.3: 实现 `makeKey()` 组合键生成方法
- [ ] IMPL-005.4: 实现 `getPropValueFast()` 快速获取
- [ ] IMPL-005.5: 实现 `setPropValueFast()` 快速设置
- [ ] IMPL-005.6: 实现 `migrateFromLegacyData()` 数据迁移
- [ ] IMPL-005.7: 修改 `getPropData()` 兼容新结构

### IMPL-006: 单元测试 [P2]
- [ ] IMPL-006.1: 创建测试目录结构
- [ ] IMPL-006.2: StateController 测试 - 状态管理
- [ ] IMPL-006.3: StateController 测试 - BFS缓存机制
- [ ] IMPL-006.4: StateController 测试 - 状态操作
- [ ] IMPL-006.5: StateSelect 测试 - 智能属性推断
- [ ] IMPL-006.6: StateSelect 测试 - 属性监听器
- [ ] IMPL-006.7: StateSelect 测试 - 数据结构
- [ ] IMPL-006.8: StatePropHandler 测试 - 处理器注册与调用

---

## Phase 3: 编辑器扩展 (Week 3-4)

### IMPL-007: 核心源码包结构 [P1]
- [ ] IMPL-007.1: 创建 `packages/ccc-state-controller-core/` 目录
- [ ] IMPL-007.2: 创建 `package.json` 版本信息
- [ ] IMPL-007.3: 复制源码到 `src/` 目录
- [ ] IMPL-007.4: 创建源码单元测试目录

### IMPL-008: 安装器核心模块 [P1]
- [ ] IMPL-008.1: 创建安装器目录结构
- [ ] IMPL-008.2: 实现 `installer/version-manager.js` 版本管理
- [ ] IMPL-008.3: 实现 `installer/file-copier.js` 文件复制
- [ ] IMPL-008.4: 实现 `installer/validator.js` 安装验证
- [ ] IMPL-008.5: 实现 `installer/index.js` 主入口
- [ ] IMPL-008.6: 创建版本文件模板 `.ccc-state-controller-version`

### IMPL-009: 扩展面板UI [P1]
- [ ] IMPL-009.1: 调用 /ui-ux-pro-max 生成UI设计方案
- [ ] IMPL-009.2: 实现面板 HTML 模板
- [ ] IMPL-009.3: 实现面板 CSS 样式
- [ ] IMPL-009.4: 实现面板交互逻辑
- [ ] IMPL-009.5: 集成安装器 IPC 调用

### IMPL-010: 集成测试 [P2]
- [ ] IMPL-010.1: 创建测试目录 `tests/`
- [ ] IMPL-010.2: 实现 `installer.test.js` 安装器测试
- [ ] IMPL-010.3: 创建测试 fixtures
- [ ] IMPL-010.4: 实现测试辅助函数

---

## 进度统计

| Phase | 任务数 | 完成 | 进度 |
|-------|--------|------|------|
| Phase 1 | 16 | 0 | 0% |
| Phase 2 | 25 | 0 | 0% |
| Phase 3 | 19 | 0 | 0% |
| **总计** | **60** | **0** | **0%** |
