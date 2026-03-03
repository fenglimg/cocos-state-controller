# Brainstorm: 项目优化与需求方向

## Session Metadata
- **ID**: BS-项目优化与需求方向-2026-02-28
- **Topic**: 当前项目的现有优化和新的需求方向是什么
- **Started**: 2026-02-28
- **Mode**: balanced (auto)
- **Dimensions**: technical, ux, business, feasibility
- **Roles**: system-architect, product-manager, product-owner

## Initial Context
- **Project**: ccc-smart-component-manager v1.3.0
- **Platform**: Cocos Creator 2.4.x plugin
- **Core Features**: 智能搜索、收藏系统、自动属性挂载、拖拽排序、使用统计
- **Focus**: 现有功能优化 + 新需求方向探索
- **Depth**: balanced
- **Constraints**: 保持向后兼容, Cocos Creator 2.4.x 生态

## Seed Expansion

### Original Idea
分析智能组件管理器的现有优化空间和新需求方向，从技术、用户体验和产品价值三个维度进行探索。

### CHANGELOG 已规划但未实现的功能
1. 组件跳转功能 - 点击已有组件 tab 跳转到场景节点
2. 快捷焦点功能 - 快捷键获得搜索输入焦点
3. 滚轮滑动支持 - 已有组件区域滚轮滑动
4. 英文国际化
5. 历史记录功能
6. 批量操作功能
7. 组件分类管理
8. 自定义组件支持增强
9. 快捷键支持
10. 组件预览功能
11. 导入导出配置
12. 主题定制
13. 属性挂载算法优化
14. 搜索算法优化
15. 性能优化

---

## Thought Evolution Timeline

### Round 1: Seed Understanding
- Identified 15+ planned but unimplemented features from CHANGELOG
- Current version 1.3.0 has solid foundation: search, favorites, auto-mount, drag-sort
- Key pain points: no keyboard shortcuts, no component preview, limited i18n
- Architecture: pure JavaScript, Cocos Creator 2.4.x plugin API

### Round 2: Multi-Perspective Exploration

#### Codebase Exploration (cli-explore-agent)
**12 项技术债识别, 15 项优化机会, 5 个灵感来源**

关键发现:
- **TD-003 (Bug)**: `data-manager.js:85-108` saveData() 用 `||` 做 boolean 默认值,用户无法关闭功能
- **TD-001 (Performance)**: `scene-accessor.js:423-438` getNodeByUuid() O(n) DFS 无缓存
- **TD-002 (Performance)**: `data-manager.js:113-170` 每次变更都同步写文件+重新读验证
- **TD-004 (Maintainability)**: `panel/logic.js` 1972行巨石文件
- **TD-007 (Quality)**: 仅 property-mounter.js 有测试,其余零覆盖

#### System Architect Perspective (Gemini)
1. **SA-1**: UUID 缓存 + 异步 I/O (high impact, small effort)
2. **SA-2**: Panel 模块化拆分 (high impact, large effort)
3. **SA-3**: IPC 类型安全层 (medium impact)
4. **SA-4**: 可插拔搜索 Provider 架构 (high novelty)
5. **SA-5**: Build Watch 模式 (medium impact, small effort)
6. **SA-6**: CC 3.x 兼容层设计 (long-term)

#### Product Manager Perspective (Codex)
1. **PM-1**: 全局快捷键系统 (P0)
2. **PM-2**: 自动挂载预览确认面板 (P0)
3. **PM-3**: 组件模板/预设系统 (P1)
4. **PM-4**: 组件分类与标签过滤 (P1)
5. **PM-5**: 组件节点跳转 (P1)
6. **PM-6**: saveData boolean bug 紧急修复 (P0)

#### Product Owner Perspective (Claude)
1. **PO-1**: 短期 1-2周: Bug修复+性能优化
2. **PO-2**: 中期 1-2月: 快捷键+跳转+挂载预览
3. **PO-3**: 长期 3-6月: 模板系统+架构升级
4. **PO-4**: ICE 最高: 快捷焦点+组件跳转
5. **PO-5**: 技术债与功能交替策略

#### Synthesis
**共识**: 性能优化(UUID缓存)、saveData bug、自动挂载预览、快捷键
**分歧**: Panel模块化时机、CC 3.x兼容必要性、搜索架构升级范围

### Round 3: Divergent Exploration (User Direction: 紧急修复+性能优化, 快捷键+操作效率, 自动挂载预览)

#### 新增创意 (Gemini - 开发者工作流角度)

1. **全场景引用追踪器** (创新度 5/5)
   - 痛点: 修改脚本时不知道哪些场景/节点在使用
   - 方案: 组件列表增加"探测"按钮,遍历场景列出所有挂载节点路径,一键定位
   - 从"管理"延伸到"维护",解决"不敢改代码"的恐惧感

2. **上下文感知推荐** (创新度 4/5)
   - 痛点: 新手不知道 A 组件通常需要配合 B 组件
   - 方案: 基于使用统计的组件共存频率分析,"猜你想要"推荐
   - 如: 节点已有 ScrollView → 推荐 ScrollBar

3. **智能健康审计** (创新度 4/5)
   - 痛点: 项目迭代后残留 Missing Script、空引用、冲突组件
   - 方案: "审计模式"扫描并识别问题,提供一键清理

4. **组件预设集** (创新度 4/5)
   - 痛点: 创建 UI 元素需重复添加固定组件组合
   - 方案: 将多组件+参数打包为"预设集",一键应用
   - 与 PM-3 组件模板方案高度一致

5. **组件协作便签** (创新度 3/5)
   - 痛点: 多人协作时不理解自定义参数的业务含义
   - 方案: 为组件实例添加"虚拟便签",存储在 user-data.json

#### 技术可行性深度分析 (Codex)

**快捷键系统 - 三级降级方案:**
1. **推荐**: Editor 菜单 accelerator (package.json 配置) → IPC 打开 panel → 聚焦搜索框
2. **备选**: Electron globalShortcut (主进程注册,风险较高)
3. **兜底**: Panel 内 DOM 键盘监听 (仅 panel 有焦点时)

**快捷焦点 - 关键挑战:**
- Panel 打开到 DOM ready 的时序问题 → 需要重试机制 (3次, 50-100ms 间隔)
- 多窗口/多实例 panelId 唯一性确认

**自动挂载预览 - 异步状态机重构:**
- 核心: 将 Editor.Dialog.messageBox 同步阻塞 → Promise + IPC requestId 异步模式
- 流程: panel 发起 → scene 计算候选 → needs-confirm 返回 → overlay UI 展示 → 用户选择 → scene 执行
- 关键: scene 侧保存挂起请求上下文 + 超时失效清理 + 场景变化防御

**最大风险点:**
- messageBox 替换涉及 property-mounter.js 流程拆分,工作量和回归风险最大
- 异步期间场景/节点变化的竞态条件处理

---

## Synthesis & Conclusions

### Executive Summary

经过 3 轮多视角探索(系统架构师/产品经理/产品负责人 + Gemini/Codex/Claude),识别了 **22 个想法**, 筛选出 **7 个核心方向**, 暂存 **6 个远期想法**。核心发现: 项目有坚实的功能基础,但存在关键 bug 和性能瓶颈需要紧急处理;快捷键系统是操作效率最大的改进点;从"组件管理"延伸到"组件维护"(引用追踪+健康审计)是差异化方向。

### Top Ideas (Priority Ranked)

#### P0 - 紧急/高优先级

| # | Title | Effort | Key Action |
|---|-------|--------|------------|
| 1 | **saveData boolean bug 修复** | trivial | `||` → `??` in data-manager.js:85-108 |
| 2 | **UUID 缓存 + 异步 I/O** | small | WeakMap 缓存 + DataManager 防抖写 |
| 3 | **快捷键系统 + 快捷焦点** | medium | 菜单 accelerator + IPC focus-search |

#### P1 - 核心功能增强

| # | Title | Effort | Key Action |
|---|-------|--------|------------|
| 4 | **自动挂载预览确认面板** | large | property-mounter 异步重构 + overlay UI |
| 5 | **全场景引用追踪器** | medium | scene-accessor trace handler + 结果列表 UI |
| 6 | **组件节点跳转 + 滚轮滑动** | small | 点击跳转 + CSS overflow-y |

#### P2 - 远期增值

| # | Title | Effort | Key Action |
|---|-------|--------|------------|
| 7 | **智能健康审计** | medium | 审计规则集 + 扫描引擎 + 报告 UI |

### Recommended Roadmap

```
v1.3.1 (Bug修复+性能)
├── saveData ?? 修复
├── UUID WeakMap 缓存
├── DataManager 防抖异步写
├── logger 分级路由
└── user-data.json → .gitignore

v1.4.0 (操作效率)
├── 菜单 accelerator 快捷键
├── 快捷焦点 (一键聚焦搜索框)
├── 组件节点跳转
├── 滚轮滑动支持
└── search-engine 单元测试

v1.5.0 (智能增强)
├── 自动挂载预览 overlay UI
├── property-mounter 异步重构
├── 全场景引用追踪器
└── data-manager 单元测试

v1.6.0 (维护工具)
├── 智能健康审计
├── 组件预设集/模板系统
└── Panel 渐进模块化
```

### Parked Ideas (Future)
- CC 3.x 兼容层设计 → 当 3.x 用户超 30%
- 可插拔搜索 Provider → 需要第三方扩展时
- 上下文感知推荐 → 使用数据积累后
- 组件协作便签 → 团队用户需求出现时
- Panel 完全模块化 → logic.js 超 2500 行时

### Key Insights
1. **高影响低成本优先**: saveData bug 和 UUID 缓存是最佳 ROI
2. **快捷键是效率瓶颈**: CC 2.4.x 菜单 accelerator 是成熟方案
3. **自动挂载预览是信任关键**: 但重构工作量最大,排在 v1.5.0
4. **延伸维护能力**: 引用追踪+健康审计是差异化竞争力
5. **技术债交替清理**: 每版本附带一项技术债修复

### Session Statistics
- **Rounds**: 3 (Seed → Multi-Perspective → Divergent)
- **Ideas Generated**: 22
- **Ideas Survived**: 7
- **Ideas Parked**: 6
- **Perspectives Used**: system-architect, product-manager, product-owner, gemini-creative, codex-feasibility
- **Artifacts**: brainstorm.md, exploration-codebase.json, perspectives.json, synthesis.json
