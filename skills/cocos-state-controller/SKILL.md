---
name: cocos-state-controller
description: 安装/更新/迁移/检查/上行同步 StateControllerV2·StateSelectV2 与 csc CLI，以及编辑器里的录制/回收站/@property 排除/面板操作。涉及 StateController、StateSelect、状态控制器、csc、状态录制、属性排除 时使用；问某段 API 或内部原理时直接读源码。
---

# Cocos State Controller — 总入口

`@fenglimg/cocos-state-controller` 的统一入口。**按用户意图分诊到对应 `refs/` 文档，只读需要的那一个**，不要一次性加载全部。

## 跨域红线（任何操作先守）

- **写入前必 dry-run**：迁移、update、批量改写一律先看 dry-run 结果，确认无误再写。
- **不动 canonical `.meta` uuid**：`.meta` 承载 Cocos 资源 uuid，包独占固定，绝不让 Cocos 重新生成（否则引用全断）。
- **dirty worktree 先确认归属**：动手前确认现有改动是否属于状态控制器产物，不覆盖无关改动。

## 分发归属（ccpm 吸收中）

**生命周期分发（装/升/卸/体检）正交给通用分发器 [`ccpm`](../ccpm)**——它靠本包 `package.json` 的 `cocosDist.mappings` 把 runtime/panel/skill 物化进工程，是所有 Cocos 插件的统一入口。本 skill 只保留 **ccpm 不做的领域活**：编辑器操作、prefab 迁移、上行回流。

- **装/升/卸/体检** → 优先 `ccpm install @ccc/state-controller` / `ccpm update` / `ccpm uninstall` / `ccpm doctor`（见 ccpm skill）。`csc` 同名命令为**公网兜底 / 过渡**（外部用户无内网 ccpm 时）。
- **migrate / sync --upstream** → csc 独有，ccpm 单向拉取、零领域逻辑、明确不碰，**长期保留**。

## 意图分诊

| 用户意图 | 读哪个 ref |
|---|---|
| 装/升/卸/体检插件（生命周期） | **首选 ccpm**（→ ccpm skill）；csc 兜底命令与本包专属细节见 `refs/cli-usage.md` |
| prefab `migrate` / `sync --upstream` 等 csc 独有命令的机械步骤 | `refs/cli-usage.md` |
| 在编辑器里操作：录制状态 / 移入回收站 / `@property` 纳入排除 / 用面板（state-controller-v2-panel） | `refs/editor-guide.md` |
| 把 v1 `StateController` / prefab 迁移到 V2（完整工程流程） | `refs/migrate.md` |
| 把 consumer 工程的本地改动回流到源仓开 PR（上行同步） | `refs/upstream-pr.md` |
| **某段 API 怎么调 / 内部机制是什么原理** | **不查 ref —— 直接读源码**：业务切换 API 看 `assets/script/controller/capabilities/SelectedPageIdCapability.ts`；能力与原理看 `assets/script/controller/capabilities/*.ts` 与 `StateControllerV2.ts`（392 个 JSDoc 块，**代码是唯一真源**，文档不另存副本以免漂移） |

## ref 与版本

`refs/` 随本包版本走——与代码同 repo，打 `v*` tag 时一起快照；`csc skill install` 分发的就是该版本的 ref。**改 CLI / 面板 / 迁移行为时，必须连带更新对应 ref**，否则 ref 会滞后于代码。
