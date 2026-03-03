# Analysis: ccc-state-controller 集成安装功能

## Session Metadata
- **Session ID**: ANL-ccc-state-controller-integration-2026-03-02
- **Topic**: 在 packages/ccc-state-controller 中集成 Controller 文件夹相关状态控制器的安装功能
- **Started**: 2026-03-02
- **Dimensions**: implementation, architecture, decision

## User Intent
用户希望实现以下功能：
1. **集成安装功能**: 在 `packages/ccc-state-controller` 中添加安装功能
2. **源码选择**: 独立 GitHub 仓库存放源码
3. **目标文件夹选择**: 用户可以选择具体安装的目标文件夹
4. **智能检测**: 检测目标文件夹中部分文件是否存在
   - 存在 → 直接代码替换
   - 不存在 → 新建文件
5. **不生成 meta 文件**: 安装过程不生成 Cocos Creator 的 .meta 文件

## Current Understanding

### What We Established
- 项目是一个 Cocos Creator 状态控制器系统
- **源码位置**: 独立 GitHub 仓库 `ccc-state-controller-core`
- **扩展包位置**: `packages/ccc-state-controller/` 是编辑器扩展包
- 源码文件结构：
  - `StateController.ts` - 核心控制器 (973行)
  - `StateEnum.ts` - 枚举定义 (141行)
  - `StateSelect.ts` - 状态选择器 (大型文件 102KB+)
  - `StateErrorManager.ts` - 错误管理 (218行)
  - `StatePropHandler.ts` - 属性处理器 (823行)
  - `Props/` - 属性定义子目录
    - `StateComponentProps.ts`
    - `StateNodeProps.ts`
    - `StateToolsProps.ts`
    - `StateWidgetProps.ts`

### Key Findings
1. **源码文件结构完整**: Controller 目录包含 5 个核心文件 + Props 子目录 4 个文件
2. **StateSelect.ts 最大**: 约 102KB，是核心组件
3. **依赖关系清晰**: StateSelect.ts 依赖所有其他文件
4. **当前扩展包简单**: 只是模板，需要添加安装功能

---

## Discussion Timeline

### Round 1 - Initial Exploration (2026-03-02)

#### Exploration Results
- 已探索 `assets/script/Controller/` 目录结构
- 已分析 `packages/ccc-state-controller/` 扩展包现状
- 已了解文件依赖关系

#### Decision Log
> **Decision**: 红源码存放方案
> - **Context**: 用户需要将扩展包发布到其他仓库，需要独立的源码管理
> - **Options considered**:
>   - 源码: 当前项目 vs 新建仓库 vs Git Submodule vs 独立 GitHub 仓库
>   - 触发: 菜单按钮 vs 面板按钮
>   - 路径: 弹窗选择 vs 手动输入
>   - 版本: 需要检测 vs 不需要
> - **Chosen**: **独立 GitHub 仓库** + 菜单按钮 + 弹窗选择 + 无版本检测
> - **Reason**:
>   - 独立仓库便于 npm 发布和版本管理
>   - Cocos 生态习惯，便于社区贡献
>   - 弹窗选择更直观易用
>   - 简化实现，无需版本检测逻辑
> - **Impact**: 需要创建新仓库 `ccc-state-controller-core`

#### Final Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    源码仓库 (独立 GitHub)                                │
│  ccc-state-controller-core                                              │
│  ├── src/                                                               │
│  │   ├── StateController.ts     (核心控制器)                             │
│  │   ├── StateSelect.ts         (状态选择器, ~100KB)                     │
│  │   ├── StateEnum.ts           (枚举定义)                               │
│  │   ├── StateErrorManager.ts   (错误管理)                               │
│  │   ├── StatePropHandler.ts    (属性处理器)                             │
│  │   └── Props/                                                         │
│  │       ├── StateComponentProps.ts                                     │
│  │       ├── StateNodeProps.ts                                          │
│  │       ├── StateToolsProps.ts                                          │
│  │       └── StateWidgetProps.ts                                         │
│  ├── package.json              # npm 发布配置                             │
│  └── README.md                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ npm / GitHub
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    编辑器扩展包 (当前仓库)                                │
│  packages/ccc-state-controller/                                         │
│  ├── main.js                    # 入口 + 安装逻辑                         │
│  ├── package.json               # 扩展配置                               │
│  └── panel/                                                             │
│      └── index.js               # 安装面板 UI                            │
│                                                                         │
│  安装流程:                                                              │
│  1. 菜单触发 "安装状态控制器"                                            │
│  2. 弹窗选择目标文件夹                                                   │
│  3. 从 npm/GitHub 获取源码                                              │
│  4. 检测文件是否存在 → 存在则覆盖，不存在则新建                           │
│  5. 不生成 .meta 文件                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Updated Understanding
- 确认使用独立 GitHub 仓库存放源码
- 扩展包通过 npm 或 GitHub 获取源码并安装到用户选择的目标文件夹
- 安装流程简单直接，无需版本检测

---

## Conclusions

### Summary
为 `ccc-state-controller` 扩展包添加安装功能，将 Controller 源码从独立 GitHub 仓库安装到用户项目中。

### Key Conclusions
1. **源码仓库**: 创建独立 GitHub 仓库 `ccc-state-controller-core`
2. **触发方式**: Cocos Creator 菜单按钮触发安装
3. **路径选择**: 使用编辑器自带弹窗选择目标文件夹
4. **安装逻辑**:
   - 检测文件是否存在
   - 存在则覆盖，不存在则新建
   - 不生成 .meta 文件
5. **版本控制**: 不需要版本检测，直接覆盖

### Recommendations
1. **创建独立仓库**: `ccc-state-controller-core`
   - 复制 `assets/script/Controller/` 内容到新仓库
   - 配置 package.json 支持 npm 发布
   - 添加 README 和 LICENSE

2. **修改扩展包**: `packages/ccc-state-controller/`
   - 在 main.js 中添加安装逻辑
   - 添加菜单项触发安装
   - 实现文件夹选择对话框
   - 实现文件复制/覆盖逻辑

3. **测试安装功能**
   - 测试菜单触发
   - 测试文件夹选择
   - 测试文件安装/覆盖

### Open Questions
无

### Next Steps
1. ~~创建 GitHub 仓库 `ccc-state-controller-core`~~ - 已创建
2. ~~实现扩展包安装功能~~ - 已完成
