# Cocos Creator UI 状态控制器系统（V2）

> 灵感来源:为实现类似 FairyGUI 中控制器（controller）的效果,参考开源的 Fgui 状态控制器 creator 3.0x 版本,改进为 2.x 版本并加入诸多新特性。

一个父节点定义若干「状态」,切换状态时,它管辖的子节点的位置、颜色、缩放、图片、文本等自动跟着变——本质上是一个轻量的、可序列化进 prefab 的状态/动画编辑器。

当前为 V2:核心逻辑与数据沉到一棵**不依赖编辑器插件即可运行的 Runtime**(`assets/script/controller/`),编辑器面板与 inspector 注入只作为薄 UI;另配一套分发/同步 CLI(`csc`)。

## 目录

- [适用场景](#适用场景)
- [快速开始](#快速开始)
- [录制工作流](#录制工作流)
- [inspector 属性一览](#inspector-属性一览)
- [架构与数据模型](#架构与数据模型)
- [常用 API](#常用-api)
- [进阶能力](#进阶能力)
- [分发与同步（csc CLI）](#分发与同步csc-cli)
- [从 V1 迁移](#从-v1-迁移)

---

## 适用场景

| 场景类型 | 应用示例 | 效果展示 |
|---------|---------|---------|
| 按钮状态 | 普通/悬浮/按下/禁用 | 颜色、图片、缩放变化 |
| 面板动画 | 展开/收起/淡入/淡出 | 位置、大小、透明度变化 |
| 角色状态 | 健康/受伤/死亡/技能 | 血条、图标、文本变化 |
| 流程状态 | 进行中/同意/拒绝/过期 | 文本、颜色、显隐变化 |
| 界面布局 | 横屏/竖屏/全屏/窗口 | 位置、锚点、大小变化 |

---

## 快速开始

### 第一步:获取文件

方式 A —— CLI（推荐）:通过 npm 安装 `csc`,在 Cocos 项目根目录一键安装组件目录。

```bash
npm install -g @fenglimg/cocos-state-controller
cd <your-cocos-project>
csc install            # 交互式选择 controller 目录并落地
```

方式 B —— 手动:把 `assets/script/controller/` 整个目录拷进你的项目。当前 Runtime 目录结构:

```
assets/script/controller/
├── StateControllerV2.ts        # 状态控制器核心(挂父节点)
├── StateSelectV2.ts            # 状态选择器(挂子节点)
├── StateEnumV2.ts              # 枚举定义
├── StateErrorManagerV2.ts      # 分级日志 / 错误处理
├── StatePropHandlerV2.ts       # 属性处理器(表驱动)
├── PrefabIntrospection.ts      # 属性发现(枚举可接入 prop)
├── Capability.ts               # capability 接口
├── CapabilityRegistry.ts       # capability 事件派发
├── capabilities/               # 内置 capability(录制/自动同步/联动/迁移…)
└── props/                      # inspector 折叠组 facade
```

### 第二步:添加控制器

`StateControllerV2` 加到**父节点**上,统一管理子节点的状态。

1. 在父节点上添加 `StateControllerV2` 组件。
2. 在 inspector 的 `states` 数组里增删/重排/改名状态(默认会有 `"0"` 和 `"1"`)。
3. 用 `state` 下拉切换当前状态。

### 第三步:添加选择器

1. 在要随状态变化的**子节点**上添加 `StateSelectV2`,它会按祖先链自动找到并绑定 `StateControllerV2`。
2. 之后通过**录制**把该子节点在各状态下的属性值录进去(见下一节)。

### 第四步:测试效果

在编辑器中切换 `StateControllerV2` 的 `state` 下拉(即 `selectedIndex`),观察子节点属性随状态变化。

---

## 录制工作流

V2 的属性接入以**录制**为中心,而不是手动逐项填值:

1. 在 `StateControllerV2`(或任一 `StateSelectV2`)上把 `state` 切到目标状态。
2. 点 `StateSelectV2` inspector 上的 **录制** 按钮进入录制态。
3. 直接在节点上改属性(位置、颜色、图片、文本…),改动会**自动写入当前状态并自动接入受控**。
4. 再点 **录制** 退出。要回退整次录制,用编辑器原生 Ctrl+Z。
5. 切到别的状态重复;也可用「值搬运」在相邻状态间交换/复制本节点的值。
6. 不想被某状态跟随的属性,用「排除管理」里的「+ 添加排除」移出跟随。

> 录制态不会被序列化:关闭编辑器再打开,录制态自动归零。

---

## inspector 属性一览

### StateControllerV2

| 区域 | 内容 |
|---|---|
| 控制器 id (`ctrlName`) | 控制器唯一名称 |
| `state` (`selectedIndex`) | 当前选中状态(下拉) |
| `states` (`StateValue[]`) | 状态列表,数组 UI 直接增删/重排/改名 |
| 状态操作 | 状态上移 / 状态下移 / 复制当前状态 / 删除当前状态 |
| 回收站 | 回收站内容(只读)/ 恢复 / 彻底删除 / 预览 / 退出预览 / 清空 |
| 刷新 inspector | 手动重建 state 枚举显示 |

### StateSelectV2

| 区域 | 内容 |
|---|---|
| `state` | 镜像 controller,改这里 = 切控制器状态 |
| 已跟随属性(只读) | 当前 state 已接入 prop 的可读摘要 |
| 排除管理 | 排除跟随(只读)/ + 添加排除 / - 恢复跟随 / 用户排除清单(只读) |
| 录制 | 进入/退出录制 |
| 值搬运 | 与下一 state 交换值 / 复制值到下一 state |
| 刷新 inspector | 手动刷新 |
| 重新绑定控制器 | 拷贝到新 prefab 后按祖先链重扫重绑 |

> 录制按钮统一由 `StateSelectV2` 承载;它与 `StateControllerV2` 共享同一录制态。

---

## 架构与数据模型

一条铁律决定能力的归属:**删掉插件,这个能力还在吗?在 → Runtime(逻辑 + 数据);只是看不见了 → 薄 UI。**

属性值存在 `StateSelectV2._ctrlData`,三层嵌套:`_ctrlData[ctrlId][stateKey][propRef]`。

- `ctrlId` → 哪个控制器(一棵树可挂多个,按 `ctrlId` 各管各)。
- `stateKey` → `$$default$$` 或某个状态下标。
- `propRef` → 形如 `cc.Node.x`、`cc.Sprite.spriteFrame`、`MyComp.heat`,即「组件名.属性名」。

一段真实 prefab(`MentorApplyRecordItem.prefab`,一个 5 态申请流程)里,状态文字 Label 的 `_ctrlData`:

```jsonc
"_ctrlData": {
  "1780650944582": {                 // 层1:ctrlId
    "$$stateKeyMode$$": "stateId",
    "$$default$$": {                  // 层2:默认态 = 录制时的整份基线快照
      "cc.Label.string": "未回应",     // 层3:propRef → 值
      "cc.Node.color": { "__type__": "cc.Color", "r": 255, "g": 255, "b": 255, "a": 255 },
      "cc.Label.enableBold": false
    },
    "1": { "cc.Label.string": "已同意", "cc.Label.enableBold": true },   // 数字 state 只存差量
    "2": { "cc.Label.string": "已拒绝", "cc.Node.opacity": 178.5 },
    "4": { "cc.Label.string": "已过期", "cc.Node.opacity": 76.5 }
  }
}
```

切状态时,`StateControllerV2.selectedIndex` 的 setter 通知每个 `StateSelectV2` 执行 `applyPropRefKeysToNode`,从 `_ctrlData` 读出当前 state 的 propRef 值(带用户/系统排除过滤)写回节点。横切行为(录制、自动同步、跨控制器联动、迁移)由 `CapabilityRegistry` 按事件派发给一组 capability,核心 apply 不依赖它们。

支持的值类型:`number` / `boolean` / `cc.Vec2` / `cc.Vec3` / `cc.Color` / `cc.Size` / `cc.Quat` / `cc.Asset`(如 `SpriteFrame`、`Font`)等。

---

## 常用 API

```ts
// 获取控制器(项目内 Component 按文件名注册)
const controller = node.getComponent("StateControllerV2");

// 切换状态(下标)
controller.selectedIndex = 1;

// 状态列表(每个 StateValue 带 name + stateId)
controller.states;            // StateValue[]
controller.ctrlId;            // number, Date.now() 分配

// 录制(也可在代码里起停)
controller.startRecording();
controller.stopRecording();   // 取消用 cancelRecording()
```

```ts
// StateSelectV2:排除某属性的跟随
select.setPropExcluded("cc.Node.color", true);

// 枚举节点上可接入的属性(组件名.属性名)
import { listTrackableProps } from "./controller/PrefabIntrospection";
listTrackableProps(node);     // [{ compName, propKey, propRef, cocosType, ... }]
```

```ts
// 取某个 capability(按 name)
import { CapabilityRegistry } from "./controller/CapabilityRegistry";
CapabilityRegistry.get("propertyControl");
```

> 按稳定 `stateId`(抗 reorder/delete 漂移)切换,推荐走 `SelectedPageIdCapability.setStateById(ctrl, stateId)`。

---

## 进阶能力

- 排除跟随:某属性不想被某状态覆盖,加入排除清单(`setPropExcluded` / inspector「+ 添加排除」)。
- 回收站:删除状态是软删,可恢复;也可彻底删除。
- 多控制器:一棵节点树挂多个 `StateControllerV2`,`StateSelectV2` 按 `ctrlId` 归属,互不串数据。
- 跨控制器联动:`_bindingsData`(序列化为目标控制器的数字 id),由 `MultiCtrlBindingCapability` 接线,带 A→B→A 防循环。
- 扩展值类型:自定义组件字段会被 `PrefabIntrospection` 自动发现并以 `propRef` 接入,无需手写;若要支持一种新值类型的 clone/apply,在 `StatePropHandlerV2` 的注册表里加一项(`register(...)`),不动核心逻辑。

内置 capability:`PropertyControl` / `AutoSync` / `Recording` / `Event` / `Migration` / `MultiCtrlBinding` / `SelectedPageId`。

---

## 分发与同步（csc CLI）

`csc`(npm 包 `@fenglimg/cocos-state-controller`)把「装/升/回流」做成确定性命令:

```bash
csc install            # 安装组件目录到当前 Cocos 项目(交互选目录 + 软校验)
csc diff               # 看本地与基线差异
csc doctor             # 体检
csc update             # 三方引擎驱动的版本更新
csc sync --upstream    # 本地改动反归一化后,三方 diff 出 patch 回流上游
csc migrate            # 触发 prefab 数据迁移
csc uninstall          # 卸载
```

底层:lock 读写 + 路径归一化 + sha256 指纹 + `merge3` 三方合并(`update` 与 `sync` 共用,一套引擎两个方向)。

---

## 从 V1 迁移

V1(`StateController` / `StateSelect` / 名字 key 存储)迁到 V2(`StateControllerV2` / `StateSelectV2` / `propRef` 字符串 key):

```bash
npm run migrate:v1-to-v2          # 或:node tools/migration/migrate-prefab-v1-to-v2.js
```

- 跨 prefab 拷贝后控制器没绑上,用 `StateSelectV2` inspector 的「重新绑定控制器」(`rebindController`)。
- 运行时层面,`MigrationCapability` 会在 `onCtrlDataMigrate` 事件里就地升级 `_ctrlData`。
