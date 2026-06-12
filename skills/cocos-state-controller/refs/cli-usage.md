# csc CLI 用法

`@fenglimg/cocos-state-controller` 全局 CLI。命令真源 = `bin/csc.js`（拿不准时读它的 `COMMANDS`）。

```bash
npm i -g @fenglimg/cocos-state-controller   # 全局装
csc --help                                  # 列全部命令
csc --version
```

CLI = 确定性机械活；需要看懂代码做判断的活（迁移适配、上行取舍、开 PR）交给本 skill 的其它 ref。

## install — 安装净荷到当前工程

```bash
csc install [--version X] [--runtime-path P] [--panel-path P]
```
- 拷 runtime（`assets/script/controller`）+ panel（`packages/state-controller-v2-panel`）+ **写 canonical `.meta`** + 写 `.csc/lock.json`。
- 装前做 **uuid 撞车预检**：consumer 异文件占用了包的 canonical uuid → **中止报红，不改任何文件**，提示用户重生成本地冲突方的 uuid（绝不动包的）。
- Cocos 版本不在 2.4.x **只 warn 不拦**。
- 装完提示「重启 Cocos 编辑器加载面板」。
- `--runtime-path` / `--panel-path`：自定义安装位置（记进 `.csc/lock.json`，`lock.files` 的 key 仍是 canonical 路径）。

## update — 更新到新版（三方合并）

```bash
csc update [--version Y]
```
逐 managed 文件：指纹 == lock（没动过）→ 直接覆盖；指纹 != lock（本地改过）→ 三方合并（base=装的版本 / ours=本地 / theirs=新版），无冲突自动并，**冲突打 `<<<<<<<` 标记**留人/AI 解。完后更新 `lock.json`。

## diff — 看本地相对装的版本改了什么

```bash
csc diff
```
列 `+新增 / -删除 / ~修改`（归一化后比对，行尾/平台差异不误报）。

## doctor — 体检

```bash
csc doctor
```
检查：文件齐全 / lock 一致（本地漂移=上行候选，warn） / uuid 撞车（异文件同 uuid=fail） / Cocos 版本（2.4.x） / V1 cid 残留（迁移域，目前 skipped）。无 fail 即通过。

## sync --upstream — 算上行差异

```bash
csc sync --upstream [--output patch.diff]
```
重建装的版本 pristine 基线 + 反归一化到源仓 canonical 路径 + 三方 diff → 输出 **unified patch**（canonical 路径标签，落源仓布局）。范围只 managed runtime+panel，不含 tests。patch 交「上行 PR」流程处理（见 `refs/upstream-pr.md`）。

## migrate — prefab V1→V2 迁移

```bash
csc migrate <prefab|dir...> [--write] [--backup] [--allow-remote]
```
确定性迁移引擎。默认 dry-run，`--write` 写入，`--backup` 写前备份。**remote bundle 默认拒绝**（迁 V2-cid 会崩仅 V1 runtime 的老客户端），`--allow-remote` 显式放行。完整迁移工程流程见 `refs/migrate.md`（CLI 只是其中的机械步骤）。

## skill install — 分发 skills

```bash
csc skill install [--target claude|codex|all]
```
把包内 skills 分发到 `.claude/skills` + `.codex/skills`（`--target` 过滤）。

## uninstall — 回退

```bash
csc uninstall
```
按 lock 移除 managed 文件 + `.csc/`。

## 典型工作流

- **接入新工程**：`csc install` → 重启编辑器 → `csc doctor` 确认全绿。
- **升级版本**：`csc diff`（看本地有无改动）→ `csc update` → 解冲突 → `csc doctor`。
- **回流改动**：`csc diff` → `csc sync --upstream --output up.patch` → 走 `refs/upstream-pr.md` 开 PR。
- **迁移老活动**：见 `refs/migrate.md`（用到 `csc migrate`）。
