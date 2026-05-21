# State Controller Panel — Wave 3 scaffold (本期)

> 状态: 骨架就绪 (Claude), Panel UI 待 Gemini 接入
> 设计文档: `.workflow/active/wave3-runtime-capability/PANEL-BRIEF-v0.2.md`

## 目录结构

```
packages/state-controller-panel/
├── package.json          Cocos 2.x 插件清单 (dockable panel 配置)
├── main.js               入口, 响应 :open / :close
├── scene-accessor.js     scene-script, IPC 路由层, 调 lib/handlers.js
├── lib/handlers.js       纯函数业务层, 单测覆盖 (tests/panel/handlers.test.ts)
└── panel/                ⬅ Gemini 接 UI 在这里
    ├── build.js          cocos 面板生命周期 (Polymer-style register)
    ├── template.html     panel HTML
    ├── styles.css        样式
    └── logic.js          UI 交互逻辑
```

## IPC 契约 (panel → scene-accessor)

panel/build.js 用 `Editor.Ipc.sendToPanel('scene', 'state-controller-panel:<msg>', payload, callback)`
向 scene-script 发请求, 路由名见下表 (与 scene-accessor.js 的 message handler 一一对应):

| 消息名 | payload | 返回 (result) | 作用 |
|---|---|---|---|
| `state-controller-panel:list-ctrls` | (空) | `[{uuid, ctrlId, ctrlName}]` | Panel 打开时, 列场景所有 StateController |
| `state-controller-panel:get-ctrl-snapshot` | `{uuid}` | `CtrlSnapshot` | 拉某 ctrl 完整数据 (states 列表 + 当前 index + recording 等) |
| `state-controller-panel:set-selected-index` | `{uuid, index}` | `boolean` | 切预览中的 state |
| `state-controller-panel:set-state-by-id` | `{uuid, stateId}` | `boolean` | 用稳定 stateId 切换 |
| `state-controller-panel:set-home-page` | `{uuid, stateIdOrName}` | `boolean` | 设默认启动状态 (-1 清除) |
| `state-controller-panel:set-recording` | `{uuid, isRecording}` | `boolean` | 开/关录制 |
| `state-controller-panel:add-state` | `{uuid, name}` | `stateId number, -1 失败` | 新增 state |
| `state-controller-panel:remove-state` | `{uuid, index}` | `boolean` | 删 state (至少保留 1 个) |
| `state-controller-panel:add-property` | `{ctrlUuid, selectUuid, propType}` | `boolean` | 手动加 prop |
| `state-controller-panel:dispose-all-bridges` | (空) | `true` | Panel 关闭时调, 解所有广播桥 |

## 广播事件 (scene-accessor → panel)

scene-accessor 收到 capability 事件后, 经 `Editor.Ipc.sendToPanel('state-controller-panel', '<event>', payload)`:

| 事件名 | payload | 触发时机 |
|---|---|---|
| `state-controller-panel:on-state-changed` | `{ctrlId, fromState, toState, fromName, toName}` | EventCapability stateChanged |
| `state-controller-panel:on-recording-changed` | `{ctrlId, isRecording}` | startRecording / stopRecording |
| `state-controller-panel:on-data-changed` | `{ctrlId}` | add/remove state, add prop 等本期所有数据变 |

## CtrlSnapshot 结构

```js
{
    ctrlId: number,
    ctrlName: string,
    selectedIndex: number,
    selectedStateId: number,
    homePageStateId: number,        // -1 = 未设
    isRecording: boolean,
    states: [
        { index: number, stateId: number, name: string },
        // ...
    ]
}
```

## 给 Gemini 的实装要点

1. **不要碰 lib/handlers.js / scene-accessor.js**. 这两层是 Claude 维护的 IPC + 业务函数, 已有
   测试覆盖 (tests/panel/handlers.test.ts 15 case + sceneAccessor.smoke.test.ts 2 case).
2. **新建 panel/ 子目录** (template.html / styles.css / logic.js / build.js).
   build.js 是 cocos 2.x Polymer-style 入口, 参考 `packages/ccc-smart-component-manager/panel/`
   实现风格.
3. **UI 布局参照** `PANEL-BRIEF-v0.2.md` §1 wireframe + §4 槽位映射表.
4. **缩略图实装** 参照 brief §5 (RenderTexture + LRU 缓存). 本期可仅留占位 (灰底 + 状态名),
   不实装真截图; 用 `// TODO Wave 3 后期: 实装缩略图` 标记位置.
5. **W4/W5 扩展位置** 全部 `// TODO Wave 4` / `// TODO Wave 5` 占位, 不写死布局.
6. **不引入 React/Vue/带 bundler 框架**. Polymer-style webcomponent 或 vanilla DOM 都行.
7. **测试**: UI 层 Claude 不写测试, 由 Gemini 自行在编辑器内实测. 但 IPC 调用要走
   scene-accessor 的固定路由名, 不要绕开 (绕开就丢了 broadcast 桥).
8. **Panel 关闭** 时 build.js 必须调 `dispose-all-bridges`, 否则会泄漏 capability 注册.
