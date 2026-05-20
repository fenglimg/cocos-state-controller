# BRIEF · State Controller Panel · v0.1 (draft, 移交 Gemini 实现)

> **来源**: PLN-001 Wave 1 任务 T08
> **目的**: 给 Gemini CLI 一份明确的 panel 需求 brief, 让 Gemini 自由设计 HTML/CSS/JS 实现
> **范围**: cocos creator 2.x 编辑器 panel (插件路径 `packages/state-controller-panel/`, 待新建)
> **本文不含**: HTML/CSS/JS 代码 — 那是 Gemini 委托范围 (`feedback_ui_design_delegation.md`)

---

## 1. 目标 (why this panel exists)

Wave 1 把 StateController / StateSelect 的 inspector 砍到极简 (只剩 ctrlName + selectedIndex 下拉 + currentStateLabel + 2 个跳转按钮)。
**所有"重操作"(增删改 state, 勾 prop, 调 default, capability 配置, 录制) 迁出 inspector, 进入独立 panel。**

为什么必须分离:
1. **inspector 行高有限** — controller 的字段已经撑爆默认面板, 用户找按钮像大海捞针
2. **inspector 缺少持久 state** — 每次选不同节点就刷新, 没法做"3-tab + 多状态对比"这种高密度交互
3. **inspector 不能跨节点联动** — 同一 ctrl 下多 select, inspector 各自显示, 没法做"全局视图"
4. **未来 Wave 3 codeGen / Wave 4 capability tab / Wave 5 Scene 预览** 都要 panel 容器

## 2. 功能清单 (v1 必须支持)

### 2.1 顶部导航
- 当前 ctrl 节点路径 (e.g. `Canvas/Button`) + ctrlName + ctrlId
- 切换其它已打开的 ctrl (近 5 个最近使用)
- 跳转回 inspector 按钮 (反向链接)

### 2.2 state 列表 (左栏)
- 显示所有 state: index / name / id / "当前"标记
- 操作: 新增 / 删除 / 上移 / 下移 / 复制 / 重命名
- 选中 = 切到该 state (双向同步, panel 改 selectedIndex → ctrl 同步; inspector 选 → panel 高亮)

### 2.3 prop 配置 (右栏, tab 形态)
- **Tab "Props"** (v1 主体): 列出当前 ctrl 下所有 StateSelect 节点 + 各自勾的 prop
  - 行: `[Color] state0=#ff0000  state1=#0000ff  state2=#ff0000 (default)`
  - 操作: 增减 prop / 改 prop 值 / 设 default / 删 prop
- **Tab "Capability"** (`// TODO Wave 4`): 占位, 显示"未实装"
- **Tab "CodeGen"** (`// TODO Wave 5`): 占位, 显示"未实装"

### 2.4 实时同步
- panel 改任意值 → 立刻 IPC → cocos scene 内 StateController/StateSelect 字段更新 → 重绘
- scene 内通过 inspector 改 → 反向 IPC → panel 重绘对应行

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
    states: Array<{ name: string, stateId: number }>,
    selects: Array<{
        selectNodeUuid: string,
        selectNodeName: string,
        ctrlPath: string,            // 节点路径, e.g. "Button/Bg"
        currCtrlId: number,
        pageData: TPage,             // { [stateIndex: number]: TProp, $$default$$: TProp }
        controlledProps: EnumPropName[],  // 当前 select 勾选的 prop list
    }>,
}}
```

### 3.2 读 select pageData
- 直接走 `_ctrlData[ctrlId]` (panel 不应直接 import StateSelect, 走 scene 内一个 "panel-bridge" service)
- `TProp` 形如 `{ [propEnum: number]: any }`, prop 值已被 StatePropHandler 序列化为普通 object/number

### 3.3 写回操作 (panel → scene)
所有写操作通过统一 IPC msg, payload 标 op type:
```ts
{ msg: "state-controller-panel:apply", payload: {
    op: "set-selectedIndex" | "add-state" | "delete-state" | "copy-state"
       | "rename-state" | "move-state" | "set-prop" | "set-default-prop"
       | "toggle-prop-control" | ...,
    ctrlNodeUuid: string,
    selectNodeUuid?: string,      // 操作针对 select 时填
    args: any,                    // op-specific payload
}}
```
**重要**: scene 端 bridge service 内部仍调 StateController/StateSelect 的现有 public method
(`copySelectedState`, `togglePropertyControl`, `setDefaultProp`, ...) — panel 不绕过现有 controller 逻辑, 只是远程触发。

## 4. 环境约束 (cocos 2.x panel build.js 三段式)

cocos 2.4 panel 必须遵守:
- `package.json` 描述 panel id + 入口
- `panel/index.js` 是入口, **必须**用 cocos 提供的 `Editor.Panel.extend({...})` 模式
- `panel/index.html` + `panel/style.css` 通过 Editor.Polymer 模板渲染 (cocos 2.x 是 Polymer 1.x 老版本)
- 不能用 ES module import; 必须 CommonJS `require`
- Editor IPC: `Editor.Ipc.sendToMain(...)` (panel → main) / `Editor.Ipc.sendToPanel(...)` (main → panel)
- panel ↔ scene 通信必须经 main process 转发, 不能直连

**Gemini 实现时务必先读现有 cocos 2.4 plugin 样板** (e.g. 项目根目录 `packages/ccc-smart-component-manager/`)。

## 5. IPC payload 详细形态

(参 3.1 / 3.3, v1.0 brief 会进一步细化, v0.1 先列大类)

主消息:
| 方向 | msg id | 用途 |
|---|---|---|
| panel→main→scene | `state-controller-panel:read-ctrl` | 拉一个 ctrl 完整数据 |
| scene→main→panel | `state-controller-panel:ctrl-data` | 响应数据 |
| panel→main→scene | `state-controller-panel:apply` | 任意写操作 |
| scene→main→panel | `state-controller-panel:ctrl-changed` | 主动推送 (inspector 改了, panel 重绘) |
| panel→main | `state-controller-panel:open-from-inspector` | inspector 跳转按钮触发 |

## 6. 长期扩展位 (占位 TODO, v1 不实装)

| 扩展 | Wave | TODO 标记位置 |
|---|---|---|
| state 缩略图 (visual snapshot 每个 state 的小预览图) | Wave 3 | state 列表行右侧 `// TODO Wave 3: thumbnail` |
| CodeGen tab (一键导出 ctrl + select 配置为代码) | Wave 5 | Tab 区第 3 个 tab `// TODO Wave 5: codegen` |
| 安装命令 / panel 自更新 | Wave 3 | 顶部菜单 `// TODO Wave 3: install-cli` |
| Capability tab (规则引擎, e.g. "当 flag X 为 true 切到 state Y") | Wave 4 | Tab 区第 2 个 tab `// TODO Wave 4: capability` |
| Scene 预览 (panel 内迷你 scene viewport, 实时看效果) | Wave 5 | 右下区 `// TODO Wave 5: scene-preview` |
| Tween 动画过渡 (state 切换不是瞬移, 是 lerp) | Wave 4 | prop 行编辑器 `// TODO Wave 4: tween` |

每个扩展点在 v1 panel 中**仅留 placeholder div + 一行注释**, 不写真实功能。

---

## 7. 待 v1.0 补 (Day 8 T25 定稿)

- T24 编辑器实测发现的具体 cocos 2.x panel API 限制
- Gemini 委托 prompt 模板 (含 brief 链接 / 仓库路径 / 测试期望)
- panel ↔ controller 双向同步的 race condition 处理 (panel 改完 inspector 立刻改怎么办)
