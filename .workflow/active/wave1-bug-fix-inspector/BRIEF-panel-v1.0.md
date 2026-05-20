# BRIEF · State Controller Panel · v1.0 (定稿, 移交 Gemini)

> **来源**: PLN-001 Wave 1 任务 T25
> **基线**: 本文继承 v0.1 全部内容, 在此基础上补 T07/T24 实测发现的约束 + Gemini 委托 prompt 模板
> **范围**: cocos creator 2.x 编辑器 panel (插件路径 `packages/state-controller-panel/`, 待 Gemini 创建)
> **本文不含**: HTML/CSS/JS 代码 — 全部委托 Gemini 自由实现 (`feedback_ui_design_delegation.md`)

---

## 0. 与 v0.1 的差异

| 节 | v0.1 → v1.0 变化 |
|---|---|
| 1. 目标 | 不变 |
| 2. 功能清单 | 不变 |
| 3. 数据契约 | 补 inspector 极简形态后, panel 是 ctrl/select 重操作的**唯一入口**: 老 inspector 按钮已隐藏, panel 必须实装等价功能 |
| 4. 环境约束 | 新增 "编辑器实测约束" 节 (T24 实测发现) |
| 5. IPC payload | 不变 (大类) |
| 6. 长期扩展位 | 不变 (TODO Wave N 占位) |
| **7. Gemini 委托 prompt 模板** | **新增** |
| **8. 编辑器实测约束** | **新增** |

详细文本以本文为准, v0.1 仅作历史快照保留。

---

## 1. 目标 (why this panel exists)

(同 v0.1) Wave 1 把 StateController / StateSelect 的 inspector 砍到极简:
- StateController 可见: `ctrlName / selectedIndex / currentStateLabel / recordTrigger / openPanelTrigger`
- StateSelect 可见: `currentStateProps / recordTrigger / openPanelTrigger`

**所有"重操作"(增删改 state, 勾 prop, 调 default, capability 配置, 录制) 迁出 inspector, 进入独立 panel。**

为什么必须分离: (4 条理由同 v0.1, 略)

## 2. 功能清单 (v1 必须支持)

### 2.1 顶部导航
- 当前 ctrl 节点路径 (e.g. `Canvas/Button`) + ctrlName + ctrlId
- 切换其它已打开的 ctrl (近 5 个最近使用)
- 跳转回 inspector 按钮 (反向链接)

### 2.2 state 列表 (左栏)
- 显示所有 state: index / name / id / "当前"标记
- 操作: 新增 / 删除 / 上移 / 下移 / 复制 / 重命名
- 选中 = 切到该 state (双向同步, panel 改 selectedIndex → ctrl 同步; inspector 选 → panel 高亮)
- **Wave 1 后的 必备性**: inspector 已无 `状态上移/状态下移/复制/删除` 按钮, 这些操作必须由 panel 提供 (否则 wave 1 后用户彻底不能改 state 顺序)

### 2.3 prop 配置 (右栏, tab 形态)
- **Tab "Props"** (v1 主体): 列出当前 ctrl 下所有 StateSelect 节点 + 各自勾的 prop
  - 行: `[Color] state0=#ff0000  state1=#0000ff  state2=#ff0000 (default)`
  - 操作: 增减 prop / 改 prop 值 / 设 default / 删 prop
  - **Wave 1 后的 必备性**: inspector 已无任何 prop 勾选 UI (4 个 props 子分组 全部 visible:false), 这些操作 必须 panel 提供
- **Tab "Capability"** (`// TODO Wave 4`): 占位
- **Tab "CodeGen"** (`// TODO Wave 5`): 占位

### 2.4 实时同步
- panel 改任意值 → 立刻 IPC → cocos scene 内 StateController/StateSelect 字段更新 → 重绘
- scene 内通过 inspector 改 selectedIndex → 反向 IPC → panel 重绘对应行 (注意: inspector 仅剩 selectedIndex 一个高频字段)

## 3. 数据契约 (panel 怎么读 controller / select 的数据)

### 3.1 读 StateController (向 scene 发请求)
```ts
// IPC: panel → scene
{ msg: "state-controller-panel:read-ctrl", payload: { nodeUuid: string } }

// IPC: scene → panel (响应)
{ msg: "state-controller-panel:ctrl-data", payload: {
    ctrlId: number,
    ctrlName: string,
    selectedIndex: number,
    currentStateLabel: string,          // T15 新增 getter
    states: Array<{ name: string, stateId: number }>,
    selects: Array<{
        selectNodeUuid: string,
        selectNodeName: string,
        ctrlPath: string,
        currCtrlId: number,
        pageData: TPage,                 // { [stateIndex: number]: TProp, $$default$$: TProp }
        controlledProps: EnumPropName[],
        currentStateProps: string[],     // T20 新增 getter (panel 可直接展示)
    }>,
}}
```

### 3.2 写回操作 (panel → scene)
通过统一 IPC `state-controller-panel:apply`, payload 标 op type。
**重要**: scene 端 bridge service 内部仍调 StateController/StateSelect 的现有 public method
(`copySelectedState`, `togglePropertyControl`, `setDefaultProp`, `manualReloadController`, `forceRefreshInspector`,
`autoConfigureAllProperties`, `syncDataFromMemory`, `deletePropertyWithConfirmation`, `updateAvailableProps`, ...).
Wave 1 已确保这些 method 体未删, 只是 inspector 装饰 visible:false 隐藏了入口。**panel 实现等于把这些 method 远程触发**。

### 3.3 可用的现有 public API (bridge service 调它们)

StateController:
- `selectedIndex` getter/setter (用户切 state)
- `ctrlName` getter/setter
- `states` getter (panel 列 state 列表)
- `currentStateLabel` getter (T15 新增, readonly)
- `recordTrigger` setter (T17, 当前 stub, 等 panel 接管真正录制)
- `openPanelTrigger` setter (T17, 当前 stub)
- `moveStateUp / moveStateDown / duplicateCurrentState / deleteCurrentState` setter (panel 远程触发)
- `manualRefreshTrigger` setter

StateSelect:
- `togglePropertyControl(propType, enable)` (panel 行: 增/减 prop)
- `isPropertyControlled(propType)` / `isPropertyAvailable(propType)`
- `setDefaultProp(type)` (private, 但 bridge 可调; 改 default)
- `forceRefreshInspector / syncDataFromMemory / updateAvailableProps`
- `manualReloadController / autoConfigureAllProperties`
- `deletePropertyWithConfirmation`
- `currentStateProps` getter (T20 新增, readonly)

## 4. 环境约束 (cocos 2.x panel build.js 三段式)

(同 v0.1)
- `package.json` 描述 panel id + 入口
- `panel/index.js` 必须用 `Editor.Panel.extend({...})` 模式
- `panel/index.html` + `panel/style.css` 经 Editor.Polymer (1.x 老版) 渲染
- 不能用 ES module import; 必须 CommonJS `require`
- Editor IPC: `Editor.Ipc.sendToMain(...)` / `Editor.Ipc.sendToPanel(...)`
- panel ↔ scene 必须经 main process 转发

**Gemini 实现前务必先读项目根目录 `packages/ccc-smart-component-manager/`** 作为 cocos 2.4 plugin 样板。

## 5. IPC payload 大类

| 方向 | msg id | 用途 |
|---|---|---|
| panel→main→scene | `state-controller-panel:read-ctrl` | 拉一个 ctrl 完整数据 |
| scene→main→panel | `state-controller-panel:ctrl-data` | 响应数据 |
| panel→main→scene | `state-controller-panel:apply` | 任意写操作 |
| scene→main→panel | `state-controller-panel:ctrl-changed` | 主动推送 (inspector 改了, panel 重绘) |
| panel→main | `state-controller-panel:open-from-inspector` | inspector 按钮 (openPanelTrigger) 触发 |

## 6. 长期扩展位 (占位 TODO, v1 不实装)

| 扩展 | Wave | TODO 标记位置 |
|---|---|---|
| state 缩略图 | Wave 3 | state 列表行右侧 `// TODO Wave 3: thumbnail` |
| CodeGen tab | Wave 5 | Tab 区 `// TODO Wave 5: codegen` |
| 安装命令 / panel 自更新 | Wave 3 | 顶部菜单 `// TODO Wave 3: install-cli` |
| Capability tab | Wave 4 | Tab 区 `// TODO Wave 4: capability` |
| Scene 预览 | Wave 5 | 右下区 `// TODO Wave 5: scene-preview` |
| Tween 过渡 | Wave 4 | prop 行编辑器 `// TODO Wave 4: tween` |

每个扩展点在 v1 panel 中**仅留 placeholder div + 一行注释**, 不写真实功能。

---

## 7. Gemini 委托 prompt 模板 (预填)

把下方 prompt 直接 paste 到 `maestro delegate "..." --to gemini --mode write --rule development-implement-component-ui` 中:

```
PURPOSE: 实现 cocos creator 2.x State Controller Panel v1, 提供 ctrl/select 重操作的可视化界面;
success = panel 装上后, 用户能完成 "改 state 顺序 / 增删 state / 勾 prop / 调 default 值 / 复制 state" 5 项操作,
全部走现有 controller public API。

TASK: 读取 packages/ccc-smart-component-manager 学习 cocos 2.4 plugin 三段式
  | 在 packages/state-controller-panel/ 创建 package.json + panel/index.js + panel/index.html + panel/style.css
  | scene 端 bridge service 注册 IPC handler 转发到 StateController/StateSelect 现有 public method
  | 顶部导航 / state 列表 / prop tab 三栏布局 (布局风格自由发挥, 但优先 dark theme + 高密度信息)
  | 6 个长期扩展位仅留 placeholder div + // TODO Wave N 注释, 不实装
  | 写一份 README.md 说明安装步骤 + 已知约束

MODE: write

CONTEXT: @.workflow/active/wave1-bug-fix-inspector/BRIEF-panel-v1.0.md @packages/ccc-smart-component-manager/**/*
  @assets/script/controller/StateController.ts @assets/script/controller/StateSelect.ts
  @assets/script/controller/StateEnum.ts
  | Memory: Wave 1 已把 inspector 砍到极简 (controller 5 字段 / select 3 字段),
            panel 是重操作唯一入口; controller public API 全在,
            bridge service 只需远程触发, 不需要改 controller 逻辑

EXPECTED: 完整可装的 cocos 2.4 plugin 目录, 装上后 cocos 编辑器顶部 Extension 菜单出现 "State Controller Panel" 项;
打开后能完成 5 项操作, IPC 双向同步; README.md 含 5 步安装 + 已知约束清单

CONSTRAINTS:
  - 严格不修改 assets/script/controller/* (controller 是 Wave 1 锁定契约, panel 仅通过 IPC 调它的现有 public API)
  - 不引入 ES module / 不引入 React/Vue/任何现代框架 (cocos 2.4 panel 是 Polymer 1.x)
  - 风格自由, 但优先 dark theme, 高密度信息密度, 不要白板大字
  - panel 内任何"长期扩展位"(state 缩略图 / CodeGen / Capability / Scene 预览 / Tween / 安装命令)
    一律仅占位 + TODO Wave N, 不实装
  - 不修改测试 (Wave 1 测试基线 414 锁定)
```

### 委托执行后验收清单

- [ ] `packages/state-controller-panel/` 目录存在, 含 4 个标准文件
- [ ] cocos 编辑器装上后 Extension 菜单出现入口
- [ ] 打开 panel 能拉到当前选中 StateController 的完整数据 (states / selects / pageData)
- [ ] panel 改 selectedIndex → cocos scene 同步切换
- [ ] panel 复制 state → 调 `copySelectedState`, 老的 T01/T02 修复(Bug A 插下一位 + Bug B 深拷贝)生效
- [ ] panel 勾 prop → 调 `togglePropertyControl`
- [ ] 6 个长期扩展位 placeholder 存在
- [ ] 测试基线未跌 (414 passed / 1 skipped)

---

## 8. 编辑器实测约束 (T07/T24 实测发现, v1.0 新增)

⚠️ **本节填写状态: 待用户在 cocos 中按 T07/T24 实测后补充**。

预占位 (实测后由用户/Claude 接续填):

### 8.1 cocos 2.4 panel API 限制 (T24 场景 D 加载老 scene 时发现)

- (待填) 当 @property visible:false 加在 getter 上, cocos 是否仍把它写入 scene 文件? 还是只对原型有效?
- (待填) `_ctrlData` 加 visible:false 后, scene 文件中的 _ctrlData 字段是否仍正常保存/读取?
- (待填) cocos 2.4 panel 的 IPC 消息体大小限制 (估计 < 1MB, 大 ctrlData 可能要分页)

### 8.2 控件交互的非预期行为 (T24 场景 B 实测)

- (待填) `currentStateProps` 字符串数组在 inspector 中的渲染形态 (单行/多行/折叠/竖直列表?)
- (待填) recordTrigger / openPanelTrigger 的 displayName 中 emoji 是否被 cocos 老 Polymer 正确渲染?

### 8.3 panel ↔ inspector race condition (功能联动)

- (待填) panel 改完字段, 但 inspector 还显示旧值的场景 (是否需要 panel 主动调 forceRefreshInspector?)
- (待填) inspector 主动改 selectedIndex 时, panel 应在多久内重绘 (~100ms?), 是否需要去抖

---

## 出 Wave 1 → Wave 2 交接清单

- [x] BRIEF v1.0 已起草 (T08 v0.1 → T25 v1.0)
- [ ] 8.x 节由用户在 T24 实测后补充
- [ ] panel 实装 prompt 拷给 Gemini (开 Wave 2 后执行)
- [ ] Wave 1 → Wave 2 之间留 1 周冷静期 (按 5_wave_plan 强制)
