# `@fenglimg/cocos-state-controller` CLI 架构方案（收口）

> 本文是 grill 收口后的最终架构决策，取代 `docs/distribution-sync-plan.md` 里未决的部分。
> 包名 **`@fenglimg/cocos-state-controller`**（个人 scope，对齐 GitHub `fenglimg`）。

## 0. 定位（C）

- **纯个人工具**。source-of-truth 仓库在**个人 GitHub**（`github.com/fenglimg/cocos-state-controller`）。
- 分发走**公开 npm**，包名 `@fenglimg/cocos-state-controller`。
- 上行回流 = **CLI 算差异 + 在 GitHub 手动开 PR**（无原生跨平台 MR；公司 consumer 也走 GitHub PR）。
- 接受 bus-factor / IP 归属风险（个人定位的代价）。

## 1. 交付与版本

- **全局 CLI**：`npm i -g @fenglimg/cocos-state-controller`，进到哪个项目就 `csc install`。
- **一体单 semver**：一个包 = `bin/csc.js` + manifest + **可安装净荷**（controller 源码+`.meta` / panel / 迁移 `.js` / skills）。runtime/panel/skill 不各自独立版本。
- **仓库 ≠ npm 包**：
  - 仓库（GitHub）= 完整 Cocos 工程（为了编辑器真机测控制器）。
  - npm 包（发布）= 瘦净荷，用 `files` 白名单卡死；**不含** `library/` `temp/` 场景 `.fire` `node_modules/` `tests/`。
  - 关键：上行重建基线 = `npm pack <pkg>@vX`，所以发布包必须正好装着 pristine 净荷（按源仓路径布局）。
- **发版**：push git tag → GitHub Action 跑全部测试（门禁）→ `npm publish` + GitHub Release。

## 2. 安装路径与"自包含"前提（Q1）

- 安装路径**可配置**，记在 `.csc/lock.json`。
- runtime **内部自包含**（全 `./Xxx` 相对引用），装到哪都不破自己的 import。
- 可配置路径真正产生"重写/归一化"需求的只有：**panel `handlers.js` → runtime 的 require**（源仓 tests 只在源仓，不分发）。
- consumer 自己的业务代码 import 由用户掌控，CLI 不碰。

## 3. 状态数据结构（Q2）— `.csc/` 文件夹

```
.csc/
  lock.json     # { packageVersion, installPaths{runtime,panel}, files{相对路径: sha256(归一化后内容)} }   ← 提交 git
  install.log   # 可选: 安装/更新时间、检测到的 Cocos 版本                                                ← 提交
  cache/        # 可选临时(一般不需要, 上行基线从 npm 现拉, 不囤 pristine)                                  ← gitignore
```

- `lock.json` **必须提交**：全队共享"装了哪版/装哪/各文件指纹"，是 update/上行的基线依据。
- **项目版本以 `lock.json` 为准**，与本地全局 CLI 版本解耦。install/update 一律读 lock，不读 CLI 自身版本。
- 装非当前版：`csc install --version 1.3`（从 npm 拉）。

## 4. 漂移政策（B）

- managed 文件**单一规范形态**。env 差异在**源仓收敛成两端通吃的写法**（如统一 `Array.from(new Set())`），不做 per-consumer fork。
- consumer **不得在 managed 文件做本地 env 适配**——要适配就是源仓 bug，上行修。
- 唯一合法的单边差异：① 路径（归一化处理）；② 非 managed 的本地文件（mock/config，不进比对）。
- 平台分支用 in-file `CC_EDITOR` 守卫，不靠 fork 文件。

## 5. 核心机制：基线重建 + 三方比对（update 与上行共用一套）

**基线重建**：从 `lock.packageVersion` 出发 `npm pack <pkg>@vX` 解出 pristine 净荷（npm 发布版不可变，永远可重建；不在 consumer 囤原件）。

### 5.1 update（Q-UPDATE）
```
对每个 managed 文件:
  指纹 == lock  → 没动过 → 直接覆盖成新版 vY
  指纹 != lock  → 本地改过 → 三方合并(base=vX pristine, ours=consumer当前, theirs=vY)
                            自动并无冲突的, 冲突打 <<<< 标记留人/AI 解
更新 lock.json
```

### 5.2 上行同步（Q-UP）
```
1. 读 lock → vX + installPaths
2. npm pack <pkg>@vX → vX pristine 基线
3. 路径反归一化: consumer 当前文件的安装路径 → 源仓 canonical 路径
4. diff(vX基线_canonical, consumer当前_canonical) → consumer 的真实改动
5. CLI 输出这份差异(patch); AI Skill 据 B 政策取舍 + 写提交/开 GitHub PR
   (落后版本 = 补丁打到 main 由 git 三方合并 / 贡献者 rebase, 标准 PR 流程)
范围: 只 managed 文件(runtime+panel), 不含 tests。
```

## 6. uuid 地基（E）与撞车兜底

- **包独占固定 canonical `.meta` uuid**，安装原样写入、**绝不让 Cocos 重新生成**。这是跨项目可移植 + remote prefab 热更到所有客户端的前提。
- **撞车预检**（install/doctor）：扫 consumer 所有 `.meta`——
  - 同一文件用同 uuid = 同份资源，正常放行。
  - **异文件用同 uuid = 真撞**（约 1/2¹²²）→ CLI **中止/报红**，提示用户**重生成本地冲突方的 uuid**（绝不动包的）。CLI 不自动改，冲突方由用户处理。

## 7. install 的 Cocos 集成（Q-INSTALL）

- 拷 runtime + panel 文件 + 写 canonical `.meta` + 写 `.csc/lock.json`。
- panel：拷进 `packages/` + 打印"**重启 Cocos 编辑器加载面板**"。不自动注册/build。
- Cocos 版本：读工程 project settings，不在 2.4.x 范围 **只 warn 不硬拦**；doctor 也报一条。

## 8. 迁移（A + Q-MIGRATE-SPLIT）

- **remote bundle 安全门**：`RemoteBundles/` 或 bundle meta 标 remote = 热更下发，迁移 V2-cid 会崩老客户端（仅 V1 runtime）。**默认拒绝**，需显式确认"全客户端已铺 V1+V2 共存 runtime + 老客户端跌破阈值"才迁。local bundle 相对安全。
- **分工**：迁移整体由 **AI Skill 主导编排**——
  - 批量机械活（cid / propKey / stateValue 改写）→ **跑 `migrate-prefab-v1-to-v2.js`**（确定性、测试兜底，**Skill 监督下跑，不闭眼信**）。
  - 判断与兜边（适用性预扫、`stateId==index` 体检、验残留、`.js` 没覆盖的怪结构、脚本 API 升级、别误伤其它组件的 `.selectedIndex`、人工验证清单）→ **AI Agent 依具体项目适配**。
- 切换 API：业务用 `SelectedPageIdCapability.setStateById/getSelectedStateId`（稳定 stateId）；`StateControllerV2.selectedIndex` 已标 `@deprecated`（保留供 inspector/capability/panel 内部用，不删）。
- skill：`skills/cocos-scv2-migrate/SKILL.md`（一份通吃 Claude+Codex），install 时分发到 `.claude/skills` + `.codex/skills`。

## 9. CLI ↔ AI Skill 分工（Q-BOUNDARY）

> **CLI = 确定性/可验证的机械活；AI Skill = 需要看懂代码做判断的活 + 编排；Skill 调 CLI 做机械步骤。**

| 操作 | 归谁 |
|---|---|
| install / update / diff / doctor / skill install | CLI |
| prefab 批量改写（`.js`） | CLI（Skill 监督下跑） |
| 上行"算差异" | CLI |
| 脚本 API 升级 / 上行取舍 / 写提交 / 开 PR / 解冲突 / 迁移适配 | AI Skill |

## 10. CLI 命令清单

```bash
csc install [--version X] [--runtime-path P] [--panel-path P]
#   拷净荷 + 写 .meta + 写 .csc/lock.json + uuid 撞车预检 + Cocos 版本 warn + 提示重启编辑器
csc update [--version Y]
#   vY 净荷: 没动的覆盖 / 动过的三方合并; 更新 lock
csc diff
#   consumer 当前 vs 装的版本 pristine(归一化后): 列 新增/删除/修改
csc doctor
#   体检: 文件齐全 / .meta uuid==canonical / uuid 撞车 / prefab 残留 V1 cid / Cocos 版本 / panel 存在 / lock 一致
csc migrate <prefab> [--write] [--backup] [--allow-remote]
#   确定性 prefab 迁移引擎(迁移 Skill 驱动); remote bundle 默认拒绝
csc sync --upstream
#   重建 vX 基线 + 反归一化 + 三方 diff → 输出 patch(交 AI Skill 开 PR)
csc skill install [--target claude|codex|all]
#   分发 skills 到 .claude/.codex
csc uninstall
#   按 lock 移除 managed 文件 + .csc/  (回退)
```

## 11. 实施路线（供 /goal-mode 拆解，在源仓执行）

- **P0 包脚手架**：`package.json` 加 `bin`（`csc`→`bin/csc.js`）+ `files` 白名单 + 名 `@fenglimg/cocos-state-controller`。
- **P1 核心数据层**：`.csc/lock.json` 读写 + 路径归一化/反归一化 + 指纹（归一化内容 sha256）。
- **P2 基线+三方引擎**：`npm pack vX` 重建基线 + 三方合并/diff（update 与上行共用）。
- **P3 命令**：`install` / `diff` / `doctor`（含 uuid 撞车预检、Cocos 版本检测）。
- **P4 `update`**（用三方引擎）。
- **P5 `sync --upstream`**（用三方引擎，输出 patch）。
- **P6 `migrate` 包装 + `skill install`**。
- **P7 CI 发版**：tag → 测试门禁 → `npm publish` + GitHub Release。
- **横切**：上行 PR 的 AI Skill（迁移 Skill 已有，补一个"把 `csc sync` 的 diff 变 PR"的 skill）。

## 12. 仍待细化（执行时定）

- 路径归一化精确规则（要规范化的：panel require 里的安装路径前缀；`.meta` uuid 本就一致不动）。
- Cocos 版本检测的具体来源文件（project settings）。
- changelog 生成方式（手写 / 从 commit）。
- 上行 PR skill 的具体 SKILL.md。
