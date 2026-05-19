/**
 * 属性控制服务 (Phase 5.2)
 *
 * 从 StateSelect 抽出的 stateless 服务, 负责回答三个问题:
 *   1. 节点上是否有挂支持某 prop 类型的组件? (isPropertyAvailable)
 *   2. propData 中某 prop 是否处于受控状态? (isPropertyControlled)
 *   3. 列出节点上当前所有可用的 prop. (scanAvailableProperties)
 *
 * 设计点:
 * - 全部为静态方法, 状态从外部传入 (node / propData), 不持有任何实例状态
 * - 组件依赖检查改为注册表驱动 (原 56 行 switch → 14 行 register),
 *   插件可通过 registerComponentProp 注入自定义 prop 类型 ↔ 组件 的关联
 *
 * 不在本服务范围:
 *   - togglePropertyControl / addPropertyControl / removePropertyControl /
 *     autoConfigureAllProperties — 这些紧耦合 StateSelect 内部状态 (propData
 *     的写入 + setPropValue + sync 链路), 留在 StateSelect.
 */

import { EnumPropName } from "./StateEnum";
import { TProp } from "./StateSelect";

/** 组件可用性检查函数: 给一个节点, 回答 "节点上是否挂了支持本 prop 的组件?" */
export type ComponentAvailabilityCheck = (node: cc.Node) => boolean;

export class PropertyControlService {
    /** 节点基础属性 — 任何节点上都可用, 与组件无关. */
    private static nodeBasicProps: ReadonlySet<EnumPropName> = new Set([
        EnumPropName.Active,
        EnumPropName.Position,
        EnumPropName.Scale,
        EnumPropName.Color,
        EnumPropName.Size,
        EnumPropName.Euler,
        EnumPropName.Anchor,
        EnumPropName.Opacity,
    ]);

    /** 组件依赖 prop 的可用性检查注册表. 插件扩展点. */
    private static componentAvailability = new Map<EnumPropName, ComponentAvailabilityCheck>();

    /**
     * 注册一个组件依赖的 prop ↔ 组件 关联.
     *
     * 调用形如:
     *   PropertyControlService.registerComponentProp(EnumPropName.LabelString,
     *       node => !!node.getComponent(cc.Label));
     *
     * 后续 isPropertyAvailable / scanAvailableProperties 自动识别该 prop.
     */
    public static registerComponentProp(propType: EnumPropName, check: ComponentAvailabilityCheck): void {
        this.componentAvailability.set(propType, check);
    }

    /** 节点上是否可以使用某 prop 类型. */
    public static isPropertyAvailable(node: cc.Node, propType: EnumPropName): boolean {
        if (!node || !node.isValid) {
            return false;
        }
        if (this.nodeBasicProps.has(propType)) {
            return true;
        }
        const check = this.componentAvailability.get(propType);
        return check ? check(node) : false;
    }

    /** propData 中某 prop 是否标记为受控. */
    public static isPropertyControlled(propData: TProp | null | undefined, propType: EnumPropName): boolean {
        if (!propData) {
            return false;
        }
        const controlledProps = propData.$$controlledProps$$ || {};
        const propName = EnumPropName[propType];
        if (controlledProps[propName] !== undefined) {
            return true;
        }
        // 兼容旧 $$changedProp$$ 结构 (迁移期遗留)
        const changedProp = propData.$$changedProp$$ || {};
        return !!changedProp[propName];
    }

    /** 列出当前节点上所有可用的 prop. */
    public static scanAvailableProperties(node: cc.Node): EnumPropName[] {
        if (!node || !node.isValid) {
            return [];
        }
        const out: EnumPropName[] = [];
        // cc.Enum(EnumPropName) 把数字反向映射 key 设为不可枚举, for-in 只剩名字 key,
        // 通过名字反查数字值 (与 StateSelect.scanAvailableProperties Phase 4.3 修复对应).
        for (const propKey in EnumPropName) {
            const propType = (EnumPropName as any)[propKey];
            if (typeof propType !== "number" || propType === EnumPropName.Non) {
                continue;
            }
            if (this.isPropertyAvailable(node, propType as EnumPropName)) {
                out.push(propType as EnumPropName);
            }
        }
        return out;
    }
}

// ============================== 内置组件 prop 注册 ==============================
// 等价于原 StateSelect.checkNodeHasComponentForProp 的 switch 表, 改为表驱动.

PropertyControlService.registerComponentProp(EnumPropName.LabelString, n => !!n.getComponent(cc.Label));
PropertyControlService.registerComponentProp(EnumPropName.Font, n => !!n.getComponent(cc.Label));
PropertyControlService.registerComponentProp(EnumPropName.LabelFontSize, n => !!n.getComponent(cc.Label));
PropertyControlService.registerComponentProp(EnumPropName.LabelLineHeight, n => !!n.getComponent(cc.Label));
PropertyControlService.registerComponentProp(EnumPropName.LabelSpacingX, n => !!n.getComponent(cc.Label));
PropertyControlService.registerComponentProp(EnumPropName.LabelWrapEnable, n => !!n.getComponent(cc.Label));

PropertyControlService.registerComponentProp(EnumPropName.LabelOutlineColor, n => !!n.getComponent(cc.LabelOutline));

PropertyControlService.registerComponentProp(EnumPropName.SpriteFrame, n => !!n.getComponent(cc.Sprite));
PropertyControlService.registerComponentProp(EnumPropName.SpriteFillRange, n => !!n.getComponent(cc.Sprite));

PropertyControlService.registerComponentProp(EnumPropName.SliderProgress, n => !!n.getComponent(cc.Slider));
PropertyControlService.registerComponentProp(EnumPropName.EditboxString, n => !!n.getComponent(cc.EditBox));
// GrayScale 是项目自定义组件, 用字符串名查
PropertyControlService.registerComponentProp(EnumPropName.GrayScale, n => !!n.getComponent("GrayScale"));
PropertyControlService.registerComponentProp(EnumPropName.ButtonInteractable, n => !!n.getComponent(cc.Button));
PropertyControlService.registerComponentProp(EnumPropName.ProgressBarProgress, n => !!n.getComponent(cc.ProgressBar));
PropertyControlService.registerComponentProp(EnumPropName.ToggleIsChecked, n => !!n.getComponent(cc.Toggle));
PropertyControlService.registerComponentProp(EnumPropName.RichTextString, n => !!n.getComponent(cc.RichText));
PropertyControlService.registerComponentProp(EnumPropName.ScrollViewEnabled, n => !!n.getComponent(cc.ScrollView));
PropertyControlService.registerComponentProp(EnumPropName.MaskEnabled, n => !!n.getComponent(cc.Mask));

// Widget 14 个字段都依赖 cc.Widget
const widgetProps = [
    EnumPropName.WidgetEnabled,
    EnumPropName.WidgetAlignMode,
    EnumPropName.WidgetIsAlignTop,
    EnumPropName.WidgetIsAlignBottom,
    EnumPropName.WidgetIsAlignLeft,
    EnumPropName.WidgetIsAlignRight,
    EnumPropName.WidgetIsAlignHorizontalCenter,
    EnumPropName.WidgetIsAlignVerticalCenter,
    EnumPropName.WidgetTop,
    EnumPropName.WidgetBottom,
    EnumPropName.WidgetLeft,
    EnumPropName.WidgetRight,
    EnumPropName.WidgetHorizontalCenter,
    EnumPropName.WidgetVerticalCenter,
];
for (const p of widgetProps) {
    PropertyControlService.registerComponentProp(p, n => !!n.getComponent(cc.Widget));
}
