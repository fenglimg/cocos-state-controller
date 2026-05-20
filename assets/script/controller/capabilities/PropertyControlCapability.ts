/**
 * PropertyControlCapability (Wave 2 T21).
 *
 * 把现有的 StatePropertyControlService 包装成一个 capability, 让"prop 可用性 / 受控状态判断"
 * 成为可独立挂载/卸载的能力, 而非 StateSelect 紧耦合.
 *
 * 现状: StateSelect 的 isPropertyAvailable / isPropertyControlled 调 PropertyControlService
 *      静态方法. 本 capability 暴露同样的静态 API + 自注册到 Registry. 既不破现有调用,
 *      又让 panel / 第三方能力可以通过 CapabilityRegistry.get("propertyControl") 拿到.
 *
 * 命名空间: 使用 `$$controlledProps$$` (沿用历史 key, 向后兼容). 不改名为 `$$propertyControl$$`
 *          避免老 scene 数据反序列化丢失 — 这是 PLN-002 R3 的应对策略.
 */

import { CapabilityRegistry } from "../CapabilityRegistry";
import { ICapability } from "../Capability";
import { EnumPropName } from "../StateEnum";
import { PropertyControlService } from "../StatePropertyControlService";

/**
 * PropertyControlCapability — 静态工具风格 (不持实例状态), 同时实现 ICapability 接口.
 * 暴露三个核心查询方法 (同 PropertyControlService); StateSelect 现有调用保持不变.
 */
class _PropertyControlCapability implements ICapability {
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
}

/**
 * 导出对象 (不是类) — 让 PropertyControlCapability.name === "propertyControl",
 * 避免 JS function.name 默认返回类名 "_PropertyControlCapability" 的陷阱.
 *
 * 该对象同时是 ICapability 单例 (注册到 Registry) 和静态工具命名空间.
 */
export const PropertyControlCapability: ICapability & {
    isPropertyAvailable: typeof _PropertyControlCapability.isPropertyAvailable,
    isPropertyControlled: typeof _PropertyControlCapability.isPropertyControlled,
    scanAvailableProperties: typeof _PropertyControlCapability.scanAvailableProperties,
    registerComponentProp: typeof _PropertyControlCapability.registerComponentProp,
} = {
    name: "propertyControl",
    isPropertyAvailable: _PropertyControlCapability.isPropertyAvailable,
    isPropertyControlled: _PropertyControlCapability.isPropertyControlled,
    scanAvailableProperties: _PropertyControlCapability.scanAvailableProperties,
    registerComponentProp: _PropertyControlCapability.registerComponentProp,
};

// 自注册 — 模块被 require 即生效
CapabilityRegistry.register(PropertyControlCapability);
