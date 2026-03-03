# Planning Notes - WFS-state-controller-optimization

## Session Info
- **Session ID**: WFS-state-controller-optimization
- **Created**: 2026-03-02
- **Status**: planning
- **Source**: BS-state-controller-optimization-2026-03-02

---

## User Intent

### GOAL
实现状态控制器优化和编辑器集成安装功能，提升性能、开发体验和可维护性。

### SCOPE
1. **BFS缓存优化** - 核心性能优化
   - 添加 _stateSelectCache 缓存属性
   - 实现 rebuildStateSelectCache() 方法
   - 修改 updateState() 使用缓存代替BFS遍历

2. **selectedPage修复** - 快速修复
   - 在 selectedIndex setter 中触发UI刷新
   - 添加 refreshSelectedPage() 公共方法

3. **智能属性推断** - 开发体验提升
   - 实现 scanAvailableProperties() 扫描可用属性
   - 添加 autoConfigureAllProperties() 一键配置
   - 在 StateToolsProps 中添加快捷按钮

4. **属性监听器** - 双向绑定
   - 添加 _autoSyncEnabled 配置开关
   - 实现 checkPropertyChanges() 检测外部变化
   - 使用定时器轮询或节点事件监听

5. **数据结构优化** - 架构改进
   - 设计扁平化的 Map<string, TPropValue> 结构
   - 实现 migrateFromLegacyData() 数据迁移
   - 保持向后兼容

6. **单元测试** - 质量保障
   - StateController 测试：状态管理、缓存机制
   - StateSelect 测试：属性推断、监听器
   - StatePropHandler 测试：处理器注册与调用

7. **编辑器扩展安装工具**
   - ccc-state-controller 包开发（安装工具+可视化编辑器）
   - ccc-state-controller-core 源码包
   - UI设计使用 /ui-ux-pro-max

### CONTEXT
- 基于头脑风暴会话 BS-state-controller-optimization-2026-03-02 的分析结果
- 现有代码在 assets/script/Controller/ 目录
- 扩展包在 packages/ccc-state-controller/
- 核心源码将放在 packages/ccc-state-controller-core/

### KEY_CONSTRAINTS
- 保持向后兼容
- Cocos Creator 2.x 兼容
- 用户自定义安装路径
- 版本管理和覆盖更新机制

---

## Context Findings

### CRITICAL_FILES
| 文件 | 角色 | 修改目标 |
|------|------|----------|
| StateController.ts | 核心状态管理控制器 | ✅ 是 |
| StateSelect.ts | 属性绑定组件 | ✅ 是 |
| StatePropHandler.ts | 属性处理器注册 | 参考 |
| StateErrorManager.ts | 错误处理系统 | 参考 |
| StateEnum.ts | 类型定义 | 参考 |
| Props/StateNodeProps.ts | 节点属性组 | ✅ 是 |
| Props/StateToolsProps.ts | 工具属性组 | ✅ 是 |
| packages/ccc-state-controller/* | 扩展包 | ✅ 新增 |

### ARCHITECTURE
- **引擎**: Cocos Creator 2.4.13
- **语言**: TypeScript
- **模式**: 组件化状态管理

### EXISTING_PATTERNS
- BFS队列遍历状态传播
- Handler注册表模式
- 属性组委托模式
- 优雅降级机制

### CONFLICT_RISK
**级别**: LOW
- 基于现有代码优化，不引入破坏性变更
- 扩展包为新增功能，与现有代码隔离
- 已明确向后兼容约束

---

## Conflict Decisions
*冲突风险低，跳过 Phase 3*

---

## Consolidated Constraints
*待各阶段完成后汇总*

---

## Task Breakdown

### Phase 1: 核心性能优化 (Week 1)
- IMPL-001: BFS缓存优化 [P0]
- IMPL-002: selectedPage修复 [P0]
- IMPL-003: 智能属性推断 [P1]

### Phase 2: 功能增强 (Week 2)
- IMPL-004: 属性监听器系统 [P1]
- IMPL-005: 数据结构优化 [P2]
- IMPL-006: 单元测试 [P2]

### Phase 3: 编辑器扩展 (Week 3-4)
- IMPL-007: 核心源码包结构 [P1]
- IMPL-008: 安装器核心模块 [P1]
- IMPL-009: 扩展面板UI [P1]
- IMPL-010: 集成测试 [P2]

### 依赖关系
```
IMPL-001 ~ IMPL-005 ──→ IMPL-006 (单元测试)
IMPL-007 ──→ IMPL-008 ──→ IMPL-009
                        └──→ IMPL-010
```

---

## 生成文件清单
- `IMPL_PLAN.md` - 实施计划文档
- `TODO_LIST.md` - 任务检查清单
- `.task/IMPL-001.json` ~ `.task/IMPL-010.json` - 任务详情
