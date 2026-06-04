/**
 * PropertyControlCapability (Wave 2 T21).
 *
 * 把现有的 StatePropertyControlService 包装成一个 capability, 让"prop 可用性 / 受控状态判断"
 * 成为可独立挂载/卸载的能力, 而非 StateSelectV2 紧耦合.
 *
 * 现状: StateSelectV2 的 isPropertyAvailable / isPropertyControlled 调 PropertyControlService
 *      静态方法. 本 capability 暴露同样的静态 API + 自注册到 Registry. 既不破现有调用,
 *      又让 panel / 第三方能力可以通过 CapabilityRegistry.get("propertyControl") 拿到.
 *
 * 命名空间: 使用 `$$controlledProps$$` (沿用历史 key, 向后兼容). 不改名为 `$$propertyControl$$`
 *          避免老 scene 数据反序列化丢失 — 这是 PLN-002 R3 的应对策略.
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { CapabilityContext, ICapability } from "../Capability";
import { EnumPropName } from "../StateEnumV2";
import { PropertyControlService } from "../StatePropertyControlService";
import { ENUM_TO_PROPREF, PROPREF_TO_ENUM } from "../EnumPropRefMap";

/**
 * PropertyControlCapability — 静态工具风格 (不持实例状态), 同时实现 ICapability 接口.
 * 暴露三个核心查询方法 (同 PropertyControlService); StateSelectV2 现有调用保持不变.
 *
 * W6-2b: 增加 propRef 解析工具 + onPropertyControlled / onPropertyReleased hook stub.
 *   hook 当前仅做日志, 不写 ctrlData (实际数据写入仍在 StateSelectV2.addPropertyControl 路径).
 *   propRef 优先, fallback propType + ENUM_TO_PROPREF 派生.
 */
class PropertyControlCapabilityImpl implements ICapability {
    public readonly name = "propertyControl";

    /** 节点上是否可以使用某 prop 类型. (代理到 PropertyControlService) */
    public static isPropertyAvailable(node: cc.Node, propType: EnumPropName): boolean {
        return PropertyControlService.isPropertyAvailable(node, propType);
    }

    /** propData 中某 prop 是否标记为受控. */
    public static isPropertyControlled(propData: any, propType: EnumPropName): boolean {
        return PropertyControlService.isPropertyControlled(propData, propType);
    }

    /** 列出当前节点上所有可用的 prop. */
    public static scanAvailableProperties(node: cc.Node): EnumPropName[] {
        return PropertyControlService.scanAvailableProperties(node);
    }

    /** 注册第三方组件 prop 类型 (PropertyControlService.registerComponentProp 的代理) */
    public static registerComponentProp(propType: EnumPropName, check: (node: cc.Node) => boolean): void {
        PropertyControlService.registerComponentProp(propType, check);
    }

    /**
     * W6-2b: 从 ctx 解析 propRef. 优先用 ctx.propRef, fallback ctx.propType + ENUM_TO_PROPREF.
     * 返回 undefined 表示既无 propRef 又无可派生 propType (e.g. AMBIGUOUS Position/Anchor/Size/GrayScale).
     */
    public static resolvePropRef(ctx: CapabilityContext): string | undefined {
        if (typeof ctx.propRef === "string" && ctx.propRef.length > 0) return ctx.propRef;
        if (typeof ctx.propType === "number" && ctx.propType > 0) {
            return ENUM_TO_PROPREF[ctx.propType];
        }
        return undefined;
    }

    /**
     * W6-2b: 从 ctx 解析 propType (反向). 优先用 ctx.propType, fallback ctx.propRef + PROPREF_TO_ENUM.
     * 返回 undefined 表示自定义 prop (无 EnumPropName 映射).
     */
    public static resolvePropType(ctx: CapabilityContext): EnumPropName | undefined {
        if (typeof ctx.propType === "number" && ctx.propType > 0) return ctx.propType;
        if (typeof ctx.propRef === "string") {
            const mapped = PROPREF_TO_ENUM[ctx.propRef];
            if (mapped !== undefined) return mapped as EnumPropName;
        }
        return undefined;
    }
}

/**
 * 导出对象 (不是类) — 让 PropertyControlCapability.name === "propertyControl",
 * 避免 JS function.name 默认返回类名 "PropertyControlCapabilityImpl" 的陷阱.
 *
 * 该对象同时是 ICapability 单例 (注册到 Registry) 和静态工具命名空间.
 *
 * W6-2b: 加 resolvePropRef / resolvePropType 静态工具 + onPropertyControlled / onPropertyReleased
 *   hook 占位 (优先用 ctx.propRef, fallback propType).
 */
export const PropertyControlCapability: ICapability & {
    isPropertyAvailable: typeof PropertyControlCapabilityImpl.isPropertyAvailable,
    isPropertyControlled: typeof PropertyControlCapabilityImpl.isPropertyControlled,
    scanAvailableProperties: typeof PropertyControlCapabilityImpl.scanAvailableProperties,
    registerComponentProp: typeof PropertyControlCapabilityImpl.registerComponentProp,
    resolvePropRef: typeof PropertyControlCapabilityImpl.resolvePropRef,
    resolvePropType: typeof PropertyControlCapabilityImpl.resolvePropType,
} = {
    name: "propertyControl",
    isPropertyAvailable: PropertyControlCapabilityImpl.isPropertyAvailable,
    isPropertyControlled: PropertyControlCapabilityImpl.isPropertyControlled,
    scanAvailableProperties: PropertyControlCapabilityImpl.scanAvailableProperties,
    registerComponentProp: PropertyControlCapabilityImpl.registerComponentProp,
    resolvePropRef: PropertyControlCapabilityImpl.resolvePropRef,
    resolvePropType: PropertyControlCapabilityImpl.resolvePropType,

    // W6-2b: onPropertyControlled hook — 优先 propRef, fallback propType + ENUM_TO_PROPREF 派生
    onPropertyControlled(ctx: CapabilityContext): void {
        // hook 不做实际数据写入 (那是 StateSelectV2.addPropertyControl 的职责),
        // 仅消费 ctx 验证 propRef + propType 双字段并存的契约 — 让下游 capability
        // (e.g. Recording / Tween) 能用 propRef 做 propRef-aware 逻辑.
        const propRef = PropertyControlCapabilityImpl.resolvePropRef(ctx);
        const propType = PropertyControlCapabilityImpl.resolvePropType(ctx);
        // no-op: 仅契约消费. 留出 propRef + propType 给 downstream capability 用.
        void propRef;
        void propType;
    },

    onPropertyReleased(ctx: CapabilityContext): void {
        const propRef = PropertyControlCapabilityImpl.resolvePropRef(ctx);
        const propType = PropertyControlCapabilityImpl.resolvePropType(ctx);
        void propRef;
        void propType;
    },
};

// 自注册 — 模块被 require 即生效
CapabilityRegistry.register(PropertyControlCapability);
