# Cocos State Controller

用于安装、更新、迁移、检查 Cocos Creator 2.x 项目中的 `StateControllerV2` / `StateSelectV2`。

## 触发场景

当用户提到以下需求时使用本 skill：

- 安装或更新 StateControllerV2 / StateSelectV2。
- 同步 `cocos-state-controller` 到某个 Cocos 项目。
- 迁移 v1 `StateController` / `StateSelect` prefab 到 V2。
- 检查 V2 panel、controller 源码、`.meta` 或 prefab cid 是否一致。
- 处理 `migrate-prefab-v1-to-v2.js`。

## 工作原则

- 真实操作优先走 CLI 或脚本，不把迁移逻辑手写在回答里。
- 写入前必须先 dry-run。
- 遇到 dirty worktree，先确认改动是否属于 StateControllerV2 产物；不要覆盖无关改动。
- Cocos `.meta` 必须随源码一起复制，不能让 Cocos 重新生成。
- 迁移 prefab 前建议备份，批量迁移必须使用 `--backup` 或让用户明确接受无备份写入。

## 推荐命令

当前源仓内可用迁移脚本：

```bash
node tools/migration/migrate-prefab-v1-to-v2.js <prefab-or-dir>
node tools/migration/migrate-prefab-v1-to-v2.js --write --backup <prefab-or-dir>
```

通过 npm script：

```bash
npm run migrate:v1-to-v2 -- <prefab-or-dir>
npm run migrate:v1-to-v2 -- --write --backup <prefab-or-dir>
```

未来 CLI 目标：

```bash
csc install --project .
csc update --project .
csc diff --project .
csc doctor --project .
csc migrate --project . --target assets/xxx.prefab
```

## 推荐流程

安装或更新：

1. 检查目标项目 `git status --short`。
2. 运行 diff / dry-run，确认将覆盖的 controller、panel、tool、skill 文件。
3. 写入后检查 `.meta` 是否随文件存在。
4. 打开 Cocos Editor 或运行测试确认反序列化正常。

迁移：

1. 先 dry-run：

```bash
node tools/migration/migrate-prefab-v1-to-v2.js assets/path/to/Prefab.prefab
```

2. 确认统计中的 `controllers`、`selects`、`stateValues`、`propKeysMigrated` 合理。
3. 再写入：

```bash
node tools/migration/migrate-prefab-v1-to-v2.js --write --backup assets/path/to/Prefab.prefab
```

4. 再跑一次 dry-run，预期 `changedFiles=0`。
5. 搜索旧 v1 cid / `stateValue`，预期无残留。

## 输出要求

回答用户时说明：

- 改了哪些文件或目录。
- 是否执行了 dry-run / write。
- 迁移统计。
- 是否仍有旧 v1 残留。
- 哪些测试或校验已运行，哪些未运行。
