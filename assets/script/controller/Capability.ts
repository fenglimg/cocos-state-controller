/**
 * Capability 框架接口 (Wave 2 Step 2).
 *
 * 设计原则:
 *  - Core 永远薄 (StateControllerV2 + StateSelectV2 + 数据存取 + 切换协议),
 *    其它能力 (Recording / PropertyControl / AutoSync / Migration / Tween …) 都是 capability.
 *  - Capability 之间通信靠 event dispatch (CapabilityRegistry.dispatch), 不直接调用.
 *  - 数据隔离: 每个 capability 通过 ctx.namespace(propData) 读写 `$$<capName>$$` 子空间.
 *  - 删掉所有 capability, core 仍能切 state (底线; T29/T30 验证).
 *
 * 三层插件结构:
 *  - L0 内置 (本仓库 capabilities/): PropertyControl, AutoSync, Recording, Migration (占位)
 *  - L1 官方扩展 (独立 cocos plugin): Tween, StatePreviewPanel, DiffViewer, CodeGen
 *  - L2 第三方 (用户自写)
 */

import { EnumPropName } from "./StateEnumV2";
import { TPropValue } from "./StatePropHandlerV2";

/**
 * 通用 dispatch context. 各 capability 自己负责从 ctx 取所需字段.
 * 字段都可选, 由派发点 (StateControllerV2 / StateSelectV2) 决定填充哪些.
 */
export interface CapabilityContext {
    /** 派发来源控制器 */
    ctrl?: any;
    /** 涉及的 StateSelectV2 */
    select?: any;
    /** 状态切换上下文 (StateWillChange / StateChanged) */
    fromState?: number;
    toState?: number;
    /** prop apply 上下文 (onPropApply) */
    propType?: EnumPropName;
    propValue?: TPropValue;
    /**
     * W6-2b: prop 引用字符串 ("compName.propKey"), 与 propType 字段并存.
     *  - 内置 prop (EnumPropName 数字调用): 从 EnumPropRefMap 派生 propRef. AMBIGUOUS 4 项 (Position/Anchor/Size/GrayScale) 无映射 → propRef=undefined
     *  - 自定义 prop (string 调用): propRef = 调用方传入的字符串, propType = undefined 或 EnumPropName.Non
     *  - capability 实现可优先用 propRef, 再 fallback propType + EnumPropRefMap 派生
     */
    propRef?: string;
    /** 自定义额外数据, capability 之间共享 (避免直接耦合) */
    extra?: { [key: string]: unknown };
    /**
     * Capability namespace helper: 给定 propData, 返回该 capability 私有的 `$$<capName>$$` 子对象.
     * 由 CapabilityRegistry.dispatch 注入, 调用方填 propData 即可.
     */
    namespace?: (propData: any, capName: string) => { [key: string]: unknown };
}

/**
 * Capability 接口 (所有 hook 都可选).
 *
 * name 是 capability 命名空间唯一 key, 决定 ctx.namespace(propData, name) 拿到的 `$$<name>$$` 子空间.
 * 同名 register 会覆盖 (后注册赢).
 */
export interface ICapability {
    /** 命名空间唯一 key */
    name: string;

    /** 依赖的 capability 名字列表 (可选, T20+ 启用排序时使用; 当前 Wave 2 仅文档保留) */
    dependsOn?: string[];

    /** 切 state 之前 (录制中 commit diff 等) */
    onStateWillChange?(ctx: CapabilityContext): void;

    /** 切 state 之后 (录制重拍 snapshot / 其它跟随状态变化的同步) */
    onStateChanged?(ctx: CapabilityContext): void;

    /**
     * Runtime 启动初始化钩子 (Wave 3).
     * StateControllerV2.onLoad runtime path 调用. 用于 runtime 启动时
     * 自动跳到指定 state 等场景. 编辑期不触发.
     */
    onRuntimeInit?(ctx: CapabilityContext): void;

    /**
     * Prop apply 钩子 (StateSelectV2.batchUpdateUI 内调用):
     * 返回 TPropValue 则改写要 apply 的值; 返回 void / undefined 不改写.
     */
    onPropApply?(ctx: CapabilityContext, prop: { type: EnumPropName, value: TPropValue }): TPropValue | void;

    /** 录制开始 / 结束 (Recording capability 内部用) */
    onRecordingStart?(ctx: CapabilityContext): void;
    onRecordingStop?(ctx: CapabilityContext): void;

    /**
     * W6-2b: prop 接入 / 解除 钩子. togglePropertyControl(on/off) 时派发.
     *  - ctx.propType: EnumPropName 数字 (内置 prop) 或 undefined (自定义 prop)
     *  - ctx.propRef: string 引用 (内置 propRef 派生自 EnumPropRefMap; 自定义 propRef 直接来自调用方)
     */
    onPropertyControlled?(ctx: CapabilityContext): void;
    onPropertyReleased?(ctx: CapabilityContext): void;

    /**
     * 版本迁移 (用于 preset / migration capability).
     * 当前 Wave 2 不实装迁移逻辑, 仅占位接口供 MigrationCapability 实现.
     */
    onCtrlDataMigrate?(data: unknown, version: number): unknown;
}
