# StateControllerV2 分发与同步方案

## 背景

`werewolf-minigame-5sp3` 是当前 StateControllerV2 / StateSelectV2 的实战验证场，近期修复和能力扩展主要先在该项目里完成。`cocos-state-controller` 应作为源仓和分发仓，但当前缺少稳定的安装、更新、迁移流程，导致两边代码容易漂移。

本次同步先以 `werewolf-minigame-5sp3` 的 V2 产物为准，覆盖源仓的相关产物：

- `assets/script/controller/**`：StateControllerV2 / StateSelectV2 核心源码、capability、props、`.meta`。
- `packages/state-controller-v2-panel/**`：Cocos Editor 面板插件。
- `tests/core/**`、`tests/panel/**`：V2 core 和 panel 测试。
- `tools/migration/migrate-prefab-v1-to-v2.js`：v1 prefab/fire 离线迁移脚本。
- `skills/cocos-state-controller/SKILL.md`：供 Codex / Claude 使用的工作流提示。

## 目标定位

后续应把 `cocos-state-controller` 作为唯一源仓：

```text
实战项目发现问题
→ 在实战项目修复并验证
→ 回流 cocos-state-controller
→ 源仓测试、打包、发布
→ 其他 Cocos 项目通过 CLI 安装/更新/迁移
```

短期仍允许在实战项目先修，但每次修复完成后必须回流源仓，避免长期双线分叉。

## 推荐分发形态

建议把源仓整理为一个 npm CLI 包，而不是运行时 npm dependency。原因是 Cocos Creator 2.x 需要将脚本和 Editor 插件真实落盘到项目内：

```text
assets/script/controller
packages/state-controller-v2-panel
tools/migration
```

推荐包名：

```bash
@wepie/cocos-state-controller
```

推荐命令：

```bash
csc install --project .
csc update --project .
csc diff --project .
csc doctor --project .
csc migrate --project . --target assets/xxx.prefab
csc migrate --project . --all --write
csc skill install --target codex
csc skill install --target claude
```

## 命令职责

`install`：
复制 controller 源码、`.meta`、Editor 面板、迁移脚本、skill。安装时必须保留源仓内 `.meta`，不能让 Cocos 重新生成脚本 uuid。

`update`：
按 manifest 比对并更新已安装文件。默认 dry-run，显示将被改动的文件；传 `--write` 才写入；建议支持 `--backup`。

`diff`：
比较目标项目内已安装版本与当前包内版本，输出新增、删除、修改列表。

`doctor`：
检查 V2 文件是否齐全、`.meta` uuid 是否匹配、Editor 插件是否存在、Prefab 中是否仍有 v1 cid、是否存在不一致的 `stateValue` / `StateValue`。

`migrate`：
调用 `tools/migration/migrate-prefab-v1-to-v2.js`，把 v1 `StateController` / `StateSelect` 序列化数据迁到 V2。

`skill install`：
把 `skills/cocos-state-controller/SKILL.md` 安装到 `.codex/skills` 或 `.claude/skills`。Skill 只做流程指导，真实逻辑仍由 CLI 执行。

## 迁移脚本策略

迁移脚本默认 dry-run，只在 `--write` 下落盘。

当前脚本处理：

- v1 controller cid → V2 controller cid。
- v1 select cid → V2 select cid。
- `stateValue` → `StateValue`。
- 补齐 V2 inspector 分组对象：`stateOps`、`recycleBin`、`excludeGroup`、`recording`、`valueOps`。
- 补齐 V2 字段：`_bindingsData`、`_deletedStates`、`_userExcludedProps`。
- `_ctrlData` 从 state index key 迁到 `StateValue.stateId` key。
- 数字 / enum name prop key 迁到 `propRef`，例如 `5` / `SpriteFrame` → `cc.Sprite.spriteFrame`。
- `Position` / `Anchor` / `Size` 拆到子项 propRef，例如 `cc.Node.position` → `cc.Node.x/y/z`。

使用示例：

```bash
npm run migrate:v1-to-v2 -- assets/path/to/Prefab.prefab
npm run migrate:v1-to-v2 -- --write assets/path/to/Prefab.prefab
npm run migrate:v1-to-v2 -- --write --backup assets/path/to/Prefab.prefab
```

## 同步流程

从实战项目回流源仓时：

1. 先检查两个仓库的 dirty 状态。
2. 明确本次同步范围，只覆盖 StateControllerV2 相关产物。
3. 同步源码、panel、测试、迁移脚本。
4. 更新文档和 skill。
5. 运行基础校验：

```bash
npm run lint
node tools/migration/migrate-prefab-v1-to-v2.js --help
```

6. 检查差异，只 stage 本次同步相关文件。
7. 用中文提交信息提交，例如：

```bash
git commit -m "chore: 同步状态控制器 v2 产物"
```

## 风险与约束

- `.meta` 是 Cocos 脚本引用稳定性的核心，安装和更新都必须保留。
- 迁移 Prefab 前必须 dry-run，批量写入建议加 `--backup`。
- 不应长期保留 v1/v2 双实现并行维护。迁移稳定后，应逐步停止新增 v1 用法，再删除 v1 源码。
- 源仓发布前必须在至少一个实战项目跑 `doctor` 和迁移样例。

## 后续任务

- 实现 `bin/csc.js`，读取 `tools/state-controller-sync-manifest.json` 并提供 `install/update/diff/doctor/migrate/skill install`。
- 给迁移脚本补 fixture 测试。
- 在 README 中替换旧 v1 快速开始，改为 V2 + panel + CLI 流程。
- 源仓打 tag 后，在 `werewolf-minigame-5sp3` 用 CLI 自举验证。
