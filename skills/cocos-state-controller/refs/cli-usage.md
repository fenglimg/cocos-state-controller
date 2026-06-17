# csc CLI 用法

`@fenglimg/cocos-state-controller` 全局 CLI。命令真源 = `bin/csc.js`（拿不准时读它的 `COMMANDS`）。

```bash
npm i -g @fenglimg/cocos-state-controller   # 全局装
csc --help                                  # 列全部命令
csc --version
```

> **归属说明（吸收终局）**：**生命周期分发（install/update/uninstall/doctor/diff/skill）正交给通用分发器 [`ccpm`](../../ccpm)**——它靠本包 `cocosDist.mappings` 物化，是所有 Cocos 插件的统一入口。下面 §B 的 csc 同名命令是**公网兜底 / 过渡**（外部用户无内网 ccpm 时）；内网/团队场景**首选 ccpm**（见 ccpm skill）。
> **§A 的 `migrate` / `sync --upstream` 是 csc 独有领域命令，ccpm 不做，长期保留。**

CLI = 确定性机械活；需要看懂代码做判断的活（迁移适配、上行取舍、开 PR）交给本 skill 的其它 ref。

---

## A. csc 独有命令（ccpm 不做，长期保留）

### migrate — prefab V1→V2 迁移

```bash
csc migrate <prefab|dir...> [--write] [--backup] [--allow-remote]
```
确定性迁移引擎。默认 dry-run，`--write` 写入，`--backup` 写前备份。**remote bundle 默认拒绝**（迁 V2-cid 会崩仅 V1 runtime 的老客户端），`--allow-remote` 显式放行。完整迁移工程流程见 `refs/migrate.md`（CLI 只是其中的机械步骤）。

> 本质是 `tools/migration/` 下的 node 脚本（`npm run migrate:v1-to-v2`）。终局去掉 `csc` bin 后由 skill 直接调脚本。

### sync --upstream — 算上行差异

```bash
csc sync --upstream [--output patch.diff]
```
重建装的版本 pristine 基线 + 反归一化到源仓 canonical 路径 + 三方 diff → 输出 **unified patch**（canonical 路径标签，落源仓布局）。范围只 managed runtime+panel，不含 tests。patch 交「上行 PR」流程处理（见 `refs/upstream-pr.md`）。

> ccpm 是**单向拉取**（只拉不倒），回流-PR 是 csc 独有能力。本包"消费端改动回流源仓"依赖它，ccpm 不替代。

---

## B. 生命周期命令（已被 ccpm 吸收 → 首选 ccpm）

下列命令内网/团队**优先用 ccpm**；csc 同名命令仅作公网兜底 / 过渡。映射关系：

| csc | ccpm（首选） | 能力差异 |
|---|---|---|
| `csc install` | `ccpm install @ccc/state-controller` | 对等：目录选择菜单 + uuid 撞车预检 + lock |
| `csc update` | `ccpm update` | ⚠️ **有缺口**：csc 做三方合并保留本地改动；ccpm 只漂移告警+给选择，**不 merge**（见下） |
| `csc uninstall` | `ccpm uninstall <name>` | 对等：按 lock 精确卸载 |
| `csc doctor` | `ccpm doctor` | 对等（csc 多 V1 cid 残留检查，属迁移域） |
| `csc diff` | `ccpm doctor` 漂移 / `git diff` | ccpm 不出逐文件 +/-/~，用 git diff 补 |
| `csc skill install` | ccpm `cocosDist` 的 `asset` 映射自动物化 skill | 对等 |

### install — 安装净荷到当前工程

```bash
csc install [--version X] [--runtime-path P] [--panel-path P] [--no-skill]
```
- 拷 runtime（`assets/script/controller`）+ panel（`packages/state-controller-v2-panel`）+ **写 canonical `.meta`** + 写 `.csc/lock.json`。
- 装前做 **uuid 撞车预检**：consumer 异文件占用了包的 canonical uuid → **中止报红，不改任何文件**，提示用户重生成本地冲突方的 uuid（绝不动包的）。
- **默认随装分发 agent skills** 到 `.claude/skills` 与 `.codex/skills`（等价 `csc skill install --target all`）；加 `--no-skill` 关闭。
- Cocos 版本不在 2.4.x **只 warn 不拦**。装完提示「重启 Cocos 编辑器加载面板」。
- **交互式选 controller 目录**：TTY 下 `csc install` 弹 ↑↓ 菜单——默认 `assets/script/controller` 第一，其后是 `assets/` 下已有子目录（depth≤2），末项「✎ 自定义输入…」兜底。`--runtime-path P` 跳过菜单；`--yes` / 非交互走默认。panel 形态固定（须在 `packages/` 下），仅 `--panel-path P` 可改。
- **软校验**：runtime 不在 `assets/` 下、panel 不在 `packages/` 下时 **只 warn 不拦**。

### update — 更新到新版（三方合并，csc 独有于 ccpm 之处）

```bash
csc update [--version Y]
```
逐 managed 文件：指纹 == lock（没动过）→ 直接覆盖；指纹 != lock（本地改过）→ **三方合并**（base=装的版本 / ours=本地 / theirs=新版），无冲突自动并，**冲突打 `<<<<<<<` 标记**留人/AI 解。完后更新 `lock.json`。

> ⚠️ **吸收缺口**：`ccpm update` 是"重新物化 + 漂移告警"，**不做三方合并**——它的模型是"managed 文件不该本地改，要改去源仓改了重发"。本包**期望本地改动 + 上行回流**，与 ccpm 单向模型相左。若路由到 ccpm，会丢 update 的 merge 与 sync 的回流。**结论：本包的 update/sync 在 ccpm 长出对等能力前，仍走 csc。**

### diff — 看本地相对装的版本改了什么

```bash
csc diff
```
列 `+新增 / -删除 / ~修改`（归一化后比对，行尾/平台差异不误报）。

### doctor — 体检

```bash
csc doctor
```
检查：文件齐全 / lock 一致（本地漂移=上行候选，warn） / uuid 撞车（异文件同 uuid=fail） / Cocos 版本（2.4.x） / V1 cid 残留（迁移域，目前 skipped）。无 fail 即通过。

### skill install — 分发 skills

```bash
csc skill install [--target claude|codex|all]
```
把包内 skills 分发到 `.claude/skills` + `.codex/skills`（`--target` 过滤）。

### uninstall — 回退

```bash
csc uninstall
```
按 lock 移除 managed 文件 + `.csc/`。

---

## 典型工作流

- **接入新工程（首选 ccpm）**：`ccpm install @ccc/state-controller` → 重启编辑器 → `ccpm doctor` 确认全绿。无 ccpm 环境用 `csc install` → `csc doctor`。
- **升级版本（仍走 csc，需 merge）**：`csc diff`（看本地有无改动）→ `csc update` → 解冲突 → `csc doctor`。
- **回流改动（csc 独有）**：`csc diff` → `csc sync --upstream --output up.patch` → 走 `refs/upstream-pr.md` 开 PR。
- **迁移老活动**：见 `refs/migrate.md`（用到 `csc migrate`）。
