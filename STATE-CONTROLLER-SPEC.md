# State Controller 完整功能文档 V2（编辑器 / 代码 Runtime / 插件）

> **V2 修订说明（2026-06-01）**：本版基于多 LLM 文档审计（5 轮收敛，14 findings + 9 待裁决）逐条 grill 后修订。原件 `state-controller-功能文档.md` 保留作审计快照。
> **修订原则**：① 代码 bug 类（如排除对内置失效、撤销不回滚）的**预期保留不动**——文档是"照 bug 的镜子"，不向坏代码妥协，缺陷转入附录 B；② 文档自身错误（行号/版本/可见性/半成品）已改正；③ 功能边界按"删插件核心是否还在"重新校准；④ 未定的功能扩展标 `⏸ 设计待定`。

> 用途：写明本系统**所有具体功能**的「操作/能力 → 预期效果 → 验收点」。作为 `/manage-issue-discover` 的 **oracle 凭证**（用预期效果对照实际行为挖 bug）。
> 范围：代码 Runtime（StateController/StateSelect/Capabilities，**不依赖插件即闭环**）+ 编辑器（菜单/面板/组件 inspector）+ 插件（inspector 增强注入）。werewolf 移植不在范围。
> 状态：✅ 已实现已自验(jest) · 🔨 已实现待编辑器确认 · ⏸ 暂缓/设计待定 · ⚠️ 已知缺陷(见附录 B)

## 🧭 功能边界铁律（V2 新增）

> **判归属一句话**：删掉插件，这个能力还在吗？**在 → Runtime（逻辑+数据）；只是看不见 → 薄 UI（面板/注入）。**

| 功能 | 🟦 Runtime 拥有（核心+数据） | 🟨 薄 UI 呈现（只调 Runtime API） |
|---|---|---|
| 状态管理（增删改切 State）| StateController | 组件 inspector 触发器 + 面板 |
| 属性受控（接入/取消）| StateSelect | 注入徽标（主）/ 面板 |
| 排除 | StateSelect.setPropExcluded | **注入 ∅!◐ 徽标为主**；组件 inspector 控件精简 |
| 录制（start/stop/cancel/dirty 判定）| StateController+StateSelect | record 按钮 + 面板 + 注入脏值条 |
| apply / 迁移 / reparent | StateSelect | 无 UI（自动）|
| 状态可视化（● 跨 state 差异）| 数据 getPropStateValues | 注入 ●（纯插件）|
| 属性列表（可跟踪/已跟踪）| 数据 listTrackable / isControlled | **注入为主**（面板不做此两列表）|

---

# 第一部分 · 代码 Runtime（核心，plugin-independent）

## 1.1 状态管理（StateController）

数据：`ctrlId`(number, Date.now 分配) · `ctrlName` · `selectedIndex`(当前 state 下标) · `previousIndex` · `states[]`(StateValue, 每个有 stateId+name) · `isRecording`。

> ⚠️ 入口纠正(审批): 移动/复制/删除 state 的 `@property` 触发器在组件 inspector 中 `visible:false`(panel 接管, inspector 隐藏); 面板侧仅实装了 选/新增/删除, **复制(Dup)按钮禁用、移动无 UI/IPC**。`recordTrigger`/`cancelRecordTrigger` 只切录制态, 不是新增 state 入口。
> 📌 **NA-4 契约**: `states` 数组的**裸 setter** 在 newLen<2 时只 warn 仍写入 — 此为**内部低层 API（可暂处非法态）**；**公共入口（面板/触发器）保证至少留 1 个 state**（走 `removeSelectedState`）。

| 能力 | 实际入口 | 预期效果 | 验收点 |
|---|---|---|---|
| 切状态 | `selectedIndex` setter / 面板选 state | 触发 onStateWillChange→onStateChanged 派发 + 各 StateSelect `updateState` 把该 state 的属性值 apply 到节点 | 切到 state[i] 后节点属性=该 state 有效值(state 值, 缺则 default) |
| 新增 state | `states` 数组 setter(面板 +Add → add-state) | _states +1, smart-name + 分配 stateId; 新增时各 StateSelect 只刷 enumList → 新 state 受控 prop 取 default 兜底 | 新 state 入下拉; 切到它各受控 prop = default |
| 删除 state | 面板删(remove-state) / `deleteCurrentState`(私有触发器) | 数据右移补位。公共入口 `removeSelectedState` 保证至少留 1 个 | 经面板/触发器删: 剩 ≥1, 数据不串位 |
| 复制 state | `duplicateCurrentState`(StateController, inspector 隐藏触发器) — 面板 Dup 禁用 | 在当前后插入深拷贝 | 触发器路径: 新 state 值=源、独立; 面板无入口（⏸ 见专项 A）|
| 移动 state | `moveStateUp/Down`(StateController, inspector 隐藏触发器) — 面板无 UI/IPC | 相邻顺序交换 + 数据跟随 | 触发器路径: 顺序变、数据跟随; 面板无入口（⏸ 见专项 A）|
| 多控制器 | 一节点树多个 StateController | 各 ctrl 独立 ctrlId/states/数据; StateSelect 按 `_ctrlsMap[currCtrlId]` 归属 | 切不同 ctrl 互不串数据 |

## 1.2 属性受控（StateSelect）

数据模型：`_ctrlData[ctrlId][stateKey][propRef]`，stateKey = `$$default$$` | 数字 state 下标；`$$controlledProps$$` 记受控（per-state，挂在每个 stateKey 的 propData 内）；值是 number/boolean/cc 类型（Vec2/3/Color/Size/Quat/Asset）。propRef 形如 `cc.Node.x` / `cc.Sprite.spriteFrame` / `MyComp.heat`。

> ⚠️ **双轨统一进行中（附录 B #双轨）**：X 方案目标是内置+自定义**统一走 propRef 字符串 key 单一路径**。当前老 facade 路径（`addPropertyControl` 写 `$$propertyData$$` 子 bucket + 名字 key）尚未完全收敛，导致内置属性在排除/补 default/判定上与自定义不对称（F-6/F-7/F-8/F-9）。**统一后本节描述即与实现一致。**

| 能力 | 操作/入口 | 预期效果 | 验收点 |
|---|---|---|---|
| 自动接入 (auto-opt-in) | `__preload` 时 | 节点上所有 **trackable** 属性自动受控（写 default+全 state baseline）；跳过 `_`前缀/SYSTEM_EXCLUDE/visible:false/readonly/AMBIGUOUS 聚合/用户排除 | 挂 StateSelect 后基础属性及组件属性默认 controlled |
| 手动接入/取消 | `togglePropertyControl(propTypeOrRef, on)` | on=true 接入(拍当前值 baseline)+补种 default；on=false 仅删 `$$controlledProps$$` flag，保留 propData 数据 | 取消后该属性不再随 state 变；重新接入恢复 |
| 单 state 接入补 default ✅ | 晚于 __preload 接入的 prop | `togglePropertyControlByPropRef(_,true)` 写当前 state + 补种 default baseline（防切到无值 state 残留旧值，**M3-2 #1 修复**）| 集成：state[1] 接入后切 state[0] 取 default 不残留 |
| 排除（Runtime 拥有）✅ | `setPropExcluded(propRef, bool)` | true=加排除清单+退出跟随；false=移除+重新接入；幂等；同步 `_lastSeenExcluded` 快照 | 排除后该属性**不随 state 变**（内置+自定义均应生效，当前内置失效见 ⚠️附录B #F-6）、不进录制范围；恢复后回到跟踪 |
| 判定受控 | `isPropertyControlled(propTypeOrRef)` / `isPropertyControlledByPropRef(propRef)` | 查受控态，返回布尔与实际跟踪态一致（内置+自定义均应一致，当前老 facade 注册的内置判定不对称见 ⚠️附录B #F-8）| 返回布尔与实际跟踪态一致 |

## 1.3 状态切换 apply（updateState）

| 能力 | 触发 | 预期效果 | 验收点 |
|---|---|---|---|
| apply 到节点 | 切 state → `updateState(ctrl)` | 受控 prop 按 propRef apply（优先级 state 值 > default 兜底）| 切 state 后节点呈现该 state 值；该 state 无值的受控 prop 取 default |
| 排除项不 apply | — | 跳过 SYSTEM+用户排除 propRef（即使 propData 残留 baseline 也不写回）| 排除后切 state 不把该属性拽回 baseline（**内置属性当前失效见 ⚠️附录B #F-6**）|

## 1.4 录制（prefab-diff 路径）

| 能力 | 操作/入口 | 预期效果 | 验收点 |
|---|---|---|---|
| 开始录制 | `startRecording()` / 面板 🔴 | 拍受控 snapshot + 全属性 `_fullSnapshot`(排除项不入)；isRecording=true | record-badge=录制中；snapshot 不含排除项 |
| 录制中改属性 | 编辑器改节点 | 切 state / stop 时按 diff 提交到对应 state | 改后值落到当时所在 state |
| 停止并保存 | `stopRecording()` / 面板 ⏹ | commit 当前 diff；**仅手动 stop** 检测「未跟随」prop 弹窗(promptUntracked)，确认则补 default + 当前 state（内置+自定义均应补 default，当前内置不补见 ⚠️附录B #F-7）| 受控改动入库；**手动 stop** 未跟随改动弹窗 |
| 切 state 自动 stop | 录制中切 state | **走静默分支，不弹 promptUntracked**（NA-6 区分）| 切 state 不弹窗，diff 静默 commit |
| 撤销本次录制 | `cancelRecording()` / 面板 ⤺ | ctrlData **全量回滚**到录制开始前(`_initialSnapshot`)，节点视觉同步回滚（内置+自定义/数字+字符串钥匙均应回滚，当前字符串钥匙不回滚见 ⚠️附录B #F-A）| 撤销后数据与节点回到录制前 |
| 脏值检测(Runtime) | `collectDirtyControlled(ctrl)` | 返回节点当前值 ≠ 当前 state 显式存储值的受控 prop；无 default 兜底 | 录制中改"当前 state 有显式值"的受控 prop → 入列表 |
| 脏值检测(插件) | 插件 inspector-prop-state-values | 与 Runtime 不同: 插件侧比较用 **default 兜底**（state 缺值时比 default），见 3.2 | — |

## 1.5 数据模型与迁移

| 能力 | 触发 | 预期效果 | 验收点 |
|---|---|---|---|
| propRef 单一路径 (X 方案) | — | 内置+自定义统一走 propRef 字符串 key；AMBIGUOUS 聚合共 5 个不接入，子项独立。**双轨统一进行中，见 1.2 ⚠️** | ctrlData 内层为 string propRef key, 不含 5 个聚合 key |
| 迁移 (老 .fire 加载) | `__preload`→`migrateLegacyCtrlData` | number key→string propRef key；LEGACY_DROPPED_ENUMS 丢弃；AMBIGUOUS 聚合拆子项；幂等。**注：meta bucket `$$controlledProps$$`/`$$changedProp$$` 当前不迁移，随双轨统一一并理顺（NA-8）** | 老数据加载后 apply 正常、无数字残留 key |
| 双 key 读写一致 ✅ | `readPropByEnum`/`writePropByEnum` | 写 string key 时 delete 同义 number key；读 string 优先 fallback number | 不出现 string+number 双 key 不一致 |

## 1.6 reparent 坐标转换（M3-2 修复主路径）

| 能力 | 触发 | 预期效果 | 验收点 |
|---|---|---|---|
| 改父节点保位 ✅(主路径) | 拖动节点到新父 | `transPosition` 把各 state 存的位置从旧父空间换算到新父空间(读/写子项 cc.Node.x/y/z) | reparent 后各 state 位置在新父下视觉不变 |
| 残留数据过度转换 ⚠️(待修) | 同上 | **应只转"当前仍受控且未排除"的轴**；当前 `checkParentChanged` 按"有值 key"判定 → 取消跟随/排除但数据残留时仍被转换（见 ⚠️附录B #F-4）| 排除/取消跟随的轴不应被转换 |

## 1.7 Capabilities（7 个核心，CapabilityRegistry 派发）

> ⚠️ 职责收敛(审批): 部分 capability 实际比"高级能力"窄, 下表按**真实实现**描述, 高级特性的输入/输出/失败语义未充分定义者标「契约 TBD」。

| name | 真实职责 | 备注 |
|---|---|---|
| `propertyControl` | 属性可用性/接入判定 | — |
| `event` | 事件订阅/广播 | 面板广播桥依赖; 编辑器 scene-script 内降级 noop |
| `recording` | 仅广播/查询录制态, 不拥有 snapshot+diff | |
| `autoSync` | 静态开关, `autoSyncEnabled=true` | 非动态联动 |
| `migration` | 迁移框架; 当前 `migrateLegacyCtrlData` 未经 registry 调用本 capability | 框架在位但主路径直调 |
| `selectedPageId` | 选中页/ctrl 持久化 | — |
| `multiCtrlBinding` | 多控制器绑定 | — |

> 📌 **V2 精简（2026-06-01）**：`tween` / `preset` / `codeGen` 三个契约 TBD 的高级 capability 已**剔除**（含文件 + 测试 + 面板 mock 按钮），聚焦 7 个核心、消除 tween 引用已注释 enum 的编译风险。补间 / 预设 / 代码生成若未来需要，作为 L1/L2 第三方 capability 由用户自行 import。

> 验收：capability 由 CapabilityRegistry 注册; 各有 jest **测试清单/CI 证明**（非 Runtime 行为预期本身）。

---

# 第二部分 · 编辑器（菜单 / 面板 / 组件 inspector）

## 2.1 主菜单命令

| 菜单 | 消息 | 预期效果 | 验收点 |
|---|---|---|---|
| 打开面板 / 关闭面板 | `open` / `close` | 开/关 state-controller-panel | 面板出现/消失 |
| Inspector 增强：开启 / 关闭 | `inspector-mark-on` / `-off` | 注入/撤销常驻脚本(带持久化 flags) | 选中带 StateSelect 节点见/不见标记 |

> 📌 **V2**：菜单去内部 P0/P1 标记改名；`probe-inspector`(探测 DOM) 调试命令从菜单隐藏（handler 保留）。Inspector 增强**默认自动开启**（`load()` 读持久化 master flag，默认 on → 启动即注入，免手动点菜单）。

## 2.2 面板（panel/）

| 区域 | 操作 | 预期效果 | 验收点 |
|---|---|---|---|
| 控制器切换 | ‹ / ▾ / › | 在场景所有 StateController 间切换，加载其快照 | 标题/state 列表/属性随 ctrl 变 |
| state 列表 | 选 / +Add / Del（Dup/Compare/场景组合 等占位按钮 **V2 已删**）| 切/增/删 state；复制/移动改 **StateController 组件 inspector 入口**（专项 A）| 选/增/删与 Runtime 同步 |
| 录制控件 | 🔴录制 / ⏹停止 / ⤺撤销 | 调 set-recording/cancel-recording；record-badge 反映态 | 录制态切换正确（撤销回滚缺陷见 ⚠️附录B #F-A）|
| **Inspector 增强** 🔨 | 总开关 + 状态可视化/录制脏值/排除徽标 toggle | **默认自动开启**（master flag 默认 on，load 启动即注入）；总开关→mark-on/off；子开关→inspector-set-flags；`Editor.Profile` 持久化 | 默认即出标记；开关即时生效；重启记忆 |
| ~~已跟随/可接入属性列表~~ | — | **🔨 边界调整：属性列表呈现改为注入为主（见第三部分 3.7），面板不再做此两列表。** 数据由 Runtime 提供（listTrackable/isControlled）| 面板不显此两列表；改在注入层呈现 |

## 2.3 组件 inspector（StateSelect / StateController 字段）

| 字段 | 预期效果 | 验收点 |
|---|---|---|
| StateController：`selectedIndex` 下拉 | 切 state | 可见可切 |
| StateController：**移动/复制/删除** 触发器 | `visible:false`(inspector 隐藏, panel 接管) | inspector 不显这 3 个触发器 |
| StateController/StateSelect：**录制/撤销** 触发器 | **`visible:true`（故意可见，常用录制控件；两个组件都挂）** | inspector **显**录制/撤销按钮 |
| StateSelect 排除 UI（Runtime 拥有）| **🔨 边界调整：排除交互改注入 ∅!◐ 徽标为主（见 3.5），组件 inspector 重叠控件精简。** Runtime 逻辑（setPropExcluded）不变 | 排除走注入徽标点击；组件控件精简（⏸ 精简范围见专项 B）|
| StateSelect 内部字段 | _ctrlData/_currCtrlId/_root 等 visible:false 隐藏 | inspector 不显内部字段 |

---

# 第三部分 · 插件（inspector 增强注入，可选层）

> 全部经 `enableInspectorMark(flags)` 注入常驻脚本 `window.__SCI`；按 `flags{master,viz,dirty,exclude}` 门控；数据经 IPC 向 scene-script 取，纯读不改 ctrlData（排除写调 Runtime `setPropExcluded`）。

## 3.1 M1 状态行为可视化 🔨（flags.viz）

| 操作 | 预期效果 | 验收点 |
|---|---|---|
| 选中带 StateSelect 节点 | 跨 state 有不同值的属性行左侧 **蓝色 ●**；各 state 同值的行无标记 | 跨状态变→●；不变→无标记（判据 definedCount≥2 边缘见 NA-9，⏸ 专项 B）|
| hover ● | 即时弹自定义浮层：各 state 值表，当前 state 高亮，Color 带色块 | hover 即时；值与存储一致 |
| 切 state | 当前 state 值≠default 的 ● 加同色描边环，浮层底 `⚑ 已覆盖 default` | 覆盖环随切 state 动态变化 |

## 3.2 M2a-1 录制态脏值 🔨（flags.dirty）

| 操作 | 预期效果 | 验收点 |
|---|---|---|
| 录制中改受控属性未提交 | 该行 **琥珀左条**；scene 比对节点当前值 vs 该 state 存储值(default 兜底) | 录制改→左条；commit/stop→消失 |

## 3.3 M2a-2 特性开关 + 持久化 🔨 · 3.4 M2a-3 硬化 🔨

（同原文档：toggle 精确生效 / 总开关清标记 / scene:ready 重注入 / 多选不误标 / displayName 对位）

## 3.5 P2b 排除徽标（flags.exclude）— **排除交互主入口**

> 语义反转：只标**例外**行。点击调 Runtime `setPropExcluded`，**不持有排除逻辑**。**边界：本注入徽标为排除交互主入口**（组件 inspector 控件精简）。

| 标记 | 含义 | 点击 |
|---|---|---|
| ∅ 灰 + 整行变暗 | 已排除 | 恢复跟踪(unexclude) |
| ! 黄 | 未受控(掉出控制) | 加入排除(exclude) |
| ◐ | 聚合行部分子项未受控/排除 | 全部排除（payload 契约 ⏸ 见专项 B / NA-3）|

## 3.7 属性列表注入呈现 ⏸（设计待定，F-11 边界调整）

> 数据由 Runtime 提供（listTrackableProps / isPropertyControlled），注入层呈现"已跟踪/可接入"。当前面板硬编码 6 项的退化实现废弃。**具体注入交互形态归专项 B 统一设计。**

## 3.6 IPC / 数据链路（参考）

```
注入侧 __SCI → main → scene:
  inspector-req-status        → inspector-prop-status        (∅/!/◐ 分类)
  inspector-req-state-values  → inspector-prop-state-values  (● props/rows/states + dirty)
  inspector-toggle-exclude    → inspector-toggle-exclude     (调 setPropExcluded)
main flags: inspector-get/set-flags (Editor.Profile 持久化); scene:ready 重注入
```
不变量：行↔propRef 桥 = `ui-prop.__vue__.target.path` 抽 `__comps__.<序号>`；纯读 handler 不改 ctrlData。

---

# 第四部分 · 已知限制 / 暂缓

- **验证层次(oracle 用)**: (a) 源码可证；(b) jest 可证(真 cc 引擎)；(c) 仅编辑器/运行可证(DOM 标记、原生 +/-、坐标视觉)。issue-discover 对 (c) 类不能仅凭源码判缺失。
- **jest 绿 ≠ 编辑器通**：注入/IPC/DOM 桥必须真编辑器验证(dogfood)。
- **⏸ M4 改名 V2**：@ccclass 改 StateSelectV2 等 — 暂缓。当前注册名仍为 StateSelect/StateController。
- **2D inspector**：Position 只显 X/Y(不含 z)，标记按显示行聚合。z 可视化契约 ⏸（NA-5/专项 B）。
- **F-C 待编辑器验证**：`_userExcludedProps` readonly，原生 - 按钮能否删项待 dogfood。

---

# 附录 A · 数据一致性断言（oracle 可执行验收）

1. 每个 `controlledProps[propRef]`：当前 state 有值 **或** `$$default$$` 有值；切 state 后有效值 = state 值, 缺则 = default。
2. `cancelRecording()` 后：number key 与 string propRef key **都**回到 `_initialSnapshot`。（当前 #F-A 不满足 string 路径）
3. reparent 只转换"当前仍受控且未排除"的 cc.Node.x/y/z。（当前偏差见 #F-4）
4. 迁移后：propData **无非 meta 数字 key**、**无聚合 key 残留**。（meta bucket 迁移见 NA-8）
5. `writePropByEnum` 后同义 number key 必删；`readPropByEnum` 双 key 以 string 为准。
6. 新增 state 后：default 覆盖所有受控 prop。
7. 删除/移动/复制 state 后：`pageData[i]` 与 `states[i]` 语义一致；复制对象独立。
8. 排除 prop 后：apply / 录制 full snapshot / reparent 转换 **都不得写回或改动**该 prop。（内置属性 apply 当前违反见 #F-6）

# 附录 B · 确认的代码缺陷（issue 种子，红测试先行）

> 审计确认的代码 bug（6 个待修）。文档预期保留正确，缺陷在此列出供修复（TDD 红→绿）。`#F-B`（tween 引用注释 enum）已随 **V2 剔除 tween capability** 消除。

| # | 严重 | 缺陷 | 证据 | 根因 |
|---|---|---|---|---|
| **#F-A** | HIGH | cancelRecording 对 string propRef 不回滚（applyRecordingSnapshot 只处理 number key）| StateSelect.ts:2045-2049 | — |
| **#F-6** | HIGH | 排除对内置属性失效：updateState ENUM 路径无排除过滤，被排除内置属性仍 batchUpdateUI 写回 | StateSelect.ts:1799/1882-1904 | 双轨 |
| **#F-7** | MED | promptUntracked 内置属性不补 default（自定义补，内置漏）| StateSelect.ts:2291-2301 vs 823-826 | 双轨 |
| **#F-8** | MED | isPropertyControlledByPropRef 不查内置名字 key（老 facade 注册的内置判定返回 false）+ 注释自相矛盾 | StateSelect.ts:791-794 / 625 vs 789 | 双轨 |
| **#F-9** | LOW | 内置属性 double-apply（batchUpdateUI + applyPropRefKeysToNode 双写）| StateSelect.ts:924-934 | 双轨 |
| **#双轨** | — | **总根因**：X 方案未完全统一，老 facade（$$propertyData$$+名字key）与 propRef 路径并存 → F-6/7/8/9。**根治 = 真正统一双轨** | StateSelect.ts:3352-3399 vs 811-826 | — |
| **#F-4** | LOW | reparent 转换"仅残留数据"的轴（应只转当前受控未排除）| StateSelect.ts:2661 | — |

# 附录 C · M3 已修 bug（已闭环）
#1 apply 漏更新、#2/#3 reparent 坐标转换已修(M3-2,红→绿)；#4 AMBIGUOUS 双路径(LOW)暂缓。

# 附录 D · 设计待定专项（⏸ 超出文档审计，需专项探讨）

**专项 A · 触发器交互**（✅ 设计已定，待实现）
- **StateController**：move↑↓/dup/delete 改组件 inspector `visible:true`（操作整个 State 列表）。
- **StateSelect 新增局部值操作**：移动/复制/交换 **单节点各 state 的值数据**（节点级，所有受控属性；不改 state 数量/结构）——当前 state 值与相邻 state 值 交换/复制/移动，只动该节点 `_ctrlData[ctrlId][stateKey]`，不碰 selectedIndex 与其他节点。组件 inspector 入口。
- record/cancel 两组件可见（现状）。
- 语义辨析：StateController 操作 **State 列表**（影响所有节点）vs StateSelect 操作 **单节点各 state 值**（局部数据便捷操作，如 swap A1↔B1 / copy A1→B1）。**非**架构级独立 state 指针。

**专项 B · UI/UX 注入统一**
- 接 inspector hack 插件方向。✅ **已做**：注入视觉系统统一（6 标志 + 即时浮层重做，Gemini，`c9b9c66`，待 dogfood）。待定：① 属性列表注入交互形态（3.7）；② 聚合 ◐ 排除 payload 契约（NA-3）；③ z 可视化（NA-5）；④ 蓝点 definedCount 判据（NA-9）。
