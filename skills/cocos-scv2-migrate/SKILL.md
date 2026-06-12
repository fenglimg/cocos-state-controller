---
name: cocos-scv2-migrate
description: 把 Cocos Creator 2.x 的 StateController/StateSelect (V1) 迁移到 StateControllerV2/StateSelectV2 — prefab cid+数据迁移、业务脚本类型替换、状态切换 API 升级到 SelectedPageIdCapability。当用户要迁移 v1 状态控制器到 v2、migrate StateController v1 to v2、升级某个 prefab/活动到 V2 状态控制器时使用。
---

# Cocos StateController V1 → V2 迁移

把一个目标范围（某 prefab / 某活动 / 某 bundle）里的 V1 `StateController` / `StateSelect` 迁到
`StateControllerV2` / `StateSelectV2`：**prefab 序列化数据**走离线脚本，**业务脚本**走类型替换 + 切换 API 升级。

全流程在 `ActMayDayHoneyMoon` 上验证通过。严格按下面顺序执行，每步都先复核再进下一步。

## 关键不变量（先读）

- **V1 cid uuid**：controller `16b3e1ab-f9ea-4f09-ac6f-a92d6e80fdee`、select `0f62298b-7153-4520-a6bb-a5219b1b8f86`。
- **`.meta` 不可动**：prefab/脚本的 `.meta` 承载 Cocos uuid，迁移只改 `.prefab` / `.ts` 内容，绝不重生成 `.meta`（否则引用全断）。
- **stateId ≠ index**：V2 用稳定 `stateId` 切换，`selectedIndex` 是 index 级低层 API、随 reorder/delete 漂移、已 `@deprecated`。业务切换一律走 `SelectedPageIdCapability`。
- **`selectedIndex` 不能删**：`setStateById` 内部就是 `ctrl.selectedIndex = idx`，inspector 下拉、录制、panel 都依赖它。只标废弃、不删除。
- **V1 runtime 保留**：迁移单个范围不删 `Controller/StateController.ts`，项目其它地方可能仍在用。全量迁完才删 V1 源码。

## 🔴 前置安全门：local vs remote bundle

迁移会把 prefab 里的 V1 cid 改成 V2 cid。**老客户端只有 V1 runtime，拉到 V2-cid 的 prefab 会反序列化崩溃。**

- prefab 在 **`assets/RemoteBundles/...`**（或 bundle meta 标 remote）= **热更下发** → **危险**。
  必须确认「全量客户端已发版铺到 V1+V2 共存 runtime、老客户端跌破阈值」后才可迁移并热更。否则**拒绝迁移**，向用户说明时序。
- prefab 在随包发版的 **local bundle** = 脚本与 prefab 同包发布 → 相对安全（仍需走正常发版）。

开工前先判定目标 prefab 属于哪类，remote 的必须让用户显式确认发布时序。

## 迁移流程

### 1. 发现范围

```bash
# 含 V1 控制器的 prefab（cid 残留 / stateValue / V1 类名）
grep -rlE '16b3e1ab-f9ea-4f09-ac6f-a92d6e80fdee|0f62298b-7153-4520-a6bb-a5219b1b8f86|"stateValue"|"StateController"|"StateSelect"' <目标范围> --include='*.prefab' --include='*.fire'
# 引用 V1 的业务脚本
grep -rnE 'Controller/StateController|Controller/StateEnum|@property\(StateController\)|getComponent\(StateController\)|: StateController' <目标范围> --include='*.ts'
```

### 2. prefab 迁移（dry-run → write → 复核）

迁移脚本同时认 werewolf 路径与源仓路径，`--root` 指向目标工程根。

```bash
# a. dry-run，人工看统计是否合理
node tools/migration/migrate-prefab-v1-to-v2.js --root . <prefab>
#    关注 controllers / selects / stateValues / propKeysMigrated

# b. 写入（git 仓库用 git 当备份；非 git 用 --backup）
node tools/migration/migrate-prefab-v1-to-v2.js --root . --write <prefab>

# c. 再 dry-run，预期 changedFiles=0（幂等）
node tools/migration/migrate-prefab-v1-to-v2.js --root . <prefab>

# d. 残留复核，全部应为 0
grep -cE '"stateValue"|"StateController"|"StateSelect"|16b3e1ab|0f62298b' <prefab>
```

### 3. stateId == index 体检（决定切换 API 能否 drop-in）

V2 切换用 stateId。若 prefab 各 controller 的 `stateId` 恰好等于其 index（无历史删除时通常如此），且业务枚举值也按 0,1,2… 设计，则
`selectedIndex = enum` → `setStateById(ctrl, enum)` 是**零风险 drop-in**；否则需把业务枚举重映射成对应 stateId。

```bash
python3 - <prefab> <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
for i,o in enumerate(d):
    if isinstance(o.get("_states"),list):
        sid=[d[r["__id__"]].get("stateId") for r in o["_states"] if isinstance(r,dict) and "__id__" in r]
        if sid: print(f"ctrl@{i} stateIds={sid} index==stateId? {sid==list(range(len(sid)))}")
PY
```

### 4. 业务脚本：类型替换

```
import { StateController } from ".../Controller/StateController"   → StateControllerV2 from ".../ControllerV2/StateControllerV2"
import { EnumStateName } from ".../Controller/StateEnum"           → from ".../ControllerV2/StateEnumV2"
@property(StateController) / getComponent(StateController) / : StateController   → ...V2
```

### 5. 业务脚本：切换 API 升级到 SelectedPageIdCapability

加导入：
```ts
import { SelectedPageIdCapability } from ".../ControllerV2/capabilities/SelectedPageIdCapability";
```
替换（**保留原 null 守卫**；先转「写」再转「读」，避免把 `X.selectedIndex = Y` 误转成 `getSelectedStateId(X) = Y`）：
```ts
ctrl.selectedIndex = X;          // 写 → SelectedPageIdCapability.setStateById(ctrl, X);
const s = ctrl.selectedIndex;    // 读 → const s = SelectedPageIdCapability.getSelectedStateId(ctrl);
```
**易错点**：
- 只动 **StateController 类型的引用**。别碰其它组件的 `.selectedIndex`（如 `PageView` / 自定义 SliderTabbar 的 selectedIndex）。
- 注释里的 `selectedIndex` 顺手更新成 capability 说法，但别让注释参与正则误伤代码。
- `EnumStateName` 若升级后不再被引用，删掉其 import 免 lint 报错。

### 6. 复核

```bash
# 业务代码无 .selectedIndex 残留（排除注释行 与 非 controller 组件）
grep -nE '\.selectedIndex' <目标范围> --include='*.ts'
# capability 调用与导入到位
grep -nE 'SelectedPageIdCapability' <目标范围> --include='*.ts'
# 跑 V2 测试套件（若项目内含 tests/）
( cd tests && npx jest --config jest.config.js )
```

## 编辑器人工验证（脚本/测试覆盖不到，必须人来做）

1. 打开迁移后的 prefab：**无 missing component / 脚本报错**；V2 controller/select 正常显示状态下拉。
2. **`@property` / `getComponent` 连线未断**：业务组件对 controller 的引用仍指向迁移后的 V2 组件（迁移脚本 append 新组对象、不挪旧 `__id__`，但需目视确认）。
3. 预览跑一遍：状态切换的视觉与迁移前一致。

## 输出要求

回答用户时说明：改了哪些 prefab/脚本、是否 dry-run/write、迁移统计、残留是否为 0、stateId==index 体检结果、跑了哪些测试、**remote bundle 的发布时序提醒**、以及需用户在编辑器确认的 3 点。
