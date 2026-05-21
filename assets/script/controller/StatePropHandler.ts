/**
 * 属性处理器系统
 *
 * Phase 2.1 重构: 把原 41 个手写 PropHandler class (~822 行) 改成表驱动:
 *   - 1 个通用 PropHandlerManager (3 个静态方法 + 注册 Map)
 *   - 2 个辅助 factory: nodeProp / compProp
 *   - 一张注册表枚举所有 prop ↔ accessor 映射
 *
 * 设计要点:
 * - null node 守卫集中在 PropHandlerManager 三个静态方法
 *   单 handler 内不再重复 null 检查
 * - 组件依赖 prop 走 compProp(compType, fieldName), 自带"缺组件 -> undefined"
 * - 节点直接 prop / 需要 clone 复合类型的特殊 case 走 nodeProp(get, set)
 * - 扩展新 prop: 加一行 PropHandlerManager.register(...) 即可, 不再写新 class
 */

import { EnumPropName } from "./StateEnum";
import { StateErrorManager } from "./StateErrorManager";

/** 属性值统一类型 */
export type TPropValue =
    | number
    | boolean
    | string
    | cc.Vec3
    | cc.Vec2
    | cc.Color
    | cc.Size
    | cc.Quat
    | cc.SpriteFrame
    | cc.Font
    | undefined;

/** 属性处理器接口 */
export interface IPropHandler {
    /** 读取节点 / 组件当前属性值; 假定 node 非 null (manager 已做守卫) */
    getValue(node: cc.Node): TPropValue | undefined;
    /** 写入节点 / 组件属性值; 假定 node 非 null */
    setValue(node: cc.Node, value: TPropValue): void;
    /** 默认值, 通常等同 getValue */
    getDefaultValue(node: cc.Node): TPropValue | undefined;
    /**
     * 录制 diff 用: 判断两个值是否等同.
     *  - 基础类型 (number/string/boolean): ===
     *  - 复合类型 (Vec/Color/Size): 按字段值比 (含 alpha)
     *  - 资源类型 (SpriteFrame/Font): 引用比 (===)
     *  - undefined/null 双方为 nil 即 true
     * 默认实现见 PropHandlerManager 注册路径 (factory 自带 isEqual)。
     */
    isEqual(a: TPropValue, b: TPropValue): boolean;
}

/**
 * 属性处理器统一管理类
 *
 * 三个静态访问方法集中做 null node 守卫, 之后委派给注册的 handler。
 */
export class PropHandlerManager {
    private static handlers = new Map<EnumPropName, IPropHandler>();

    public static register(propType: EnumPropName, handler: IPropHandler): void {
        this.handlers.set(propType, handler);
    }

    public static getHandler(propType: EnumPropName): IPropHandler | undefined {
        return this.handlers.get(propType);
    }

    /** 列出所有已注册 prop type (供录制全 prop snapshot 等扫描场景). */
    public static listRegisteredPropTypes(): EnumPropName[] {
        const out: EnumPropName[] = [];
        this.handlers.forEach((_, k) => out.push(k));
        return out;
    }

    public static getValue(propType: EnumPropName, node: cc.Node): TPropValue | undefined {
        if (!node) return undefined;
        const handler = this.getHandler(propType);
        return handler ? handler.getValue(node) : undefined;
    }

    public static setValue(propType: EnumPropName, node: cc.Node, value: TPropValue): void {
        if (!node) return;
        const handler = this.getHandler(propType);
        if (handler) handler.setValue(node, value);
    }

    public static getDefaultValue(propType: EnumPropName, node: cc.Node): TPropValue | undefined {
        if (!node) return undefined;
        const handler = this.getHandler(propType);
        return handler ? handler.getDefaultValue(node) : undefined;
    }

    /**
     * 录制 diff 用: 判断两个值是否等同. 未注册的 propType 视为 false (保守, 视为有变化)。
     * 双方均为 nil (undefined / null) 视为 true。
     */
    public static isEqual(propType: EnumPropName, a: TPropValue, b: TPropValue): boolean {
        const aNil = a === undefined || a === null;
        const bNil = b === undefined || b === null;
        if (aNil && bNil) return true;
        if (aNil !== bNil) return false;
        const handler = this.getHandler(propType);
        if (!handler) return false;
        return handler.isEqual(a, b);
    }
}

// ============================== isEqual helpers ==============================

/** 默认 isEqual: ===, 用于基础类型与资源引用比 */
function eqStrict(a: TPropValue, b: TPropValue): boolean {
    return a === b;
}

/** Vec3 按值比 (x/y/z) */
function eqVec3(a: TPropValue, b: TPropValue): boolean {
    const av = a as cc.Vec3;
    const bv = b as cc.Vec3;
    return av.x === bv.x && av.y === bv.y && av.z === bv.z;
}

/** Vec2 按值比 (x/y) */
function eqVec2(a: TPropValue, b: TPropValue): boolean {
    const av = a as cc.Vec2;
    const bv = b as cc.Vec2;
    return av.x === bv.x && av.y === bv.y;
}

/** Color 按值比 (r/g/b/a) */
function eqColor(a: TPropValue, b: TPropValue): boolean {
    const ac = a as cc.Color;
    const bc = b as cc.Color;
    return ac.r === bc.r && ac.g === bc.g && ac.b === bc.b && ac.a === bc.a;
}

/** Size 按值比 (width/height) */
function eqSize(a: TPropValue, b: TPropValue): boolean {
    const as = a as cc.Size;
    const bs = b as cc.Size;
    return as.width === bs.width && as.height === bs.height;
}

/** 节点直接属性 (cc.Node 上的字段或方法访问); 需自定 get/set 控制复合类型 clone */
function nodeProp<T extends TPropValue>(
    get: (n: cc.Node) => T | undefined,
    set: (n: cc.Node, v: T) => void,
    isEqual: (a: TPropValue, b: TPropValue) => boolean = eqStrict,
): IPropHandler {
    return {
        getValue: get as (n: cc.Node) => TPropValue | undefined,
        setValue: (n, v) => set(n, v as T),
        getDefaultValue: get as (n: cc.Node) => TPropValue | undefined,
        isEqual,
    };
}

/** 组件依赖属性 (节点上挂载的 cc.Component, 直接 field 读写); 缺组件返回 undefined */
function compProp(
    compType: typeof cc.Component | any,
    fieldName: string,
    isEqual: (a: TPropValue, b: TPropValue) => boolean = eqStrict,
): IPropHandler {
    return {
        getValue: (node) => {
            const c = node.getComponent(compType);
            return c ? (c as any)[fieldName] : undefined;
        },
        setValue: (node, value) => {
            const c = node.getComponent(compType);
            if (c) (c as any)[fieldName] = value;
        },
        getDefaultValue: (node) => {
            const c = node.getComponent(compType);
            return c ? (c as any)[fieldName] : undefined;
        },
        isEqual,
    };
}

// ============================== 注册表 ==============================

// ---- 节点直接属性 ----
PropHandlerManager.register(EnumPropName.Active,
    nodeProp<boolean>(n => n.active, (n, v) => { n.active = v; }));

PropHandlerManager.register(EnumPropName.Position,
    nodeProp<cc.Vec3>(n => cc.v3(n.position), (n, v) => { n.position = v; }, eqVec3));

PropHandlerManager.register(EnumPropName.Euler,
    nodeProp<cc.Vec3>(n => cc.v3(n.eulerAngles), (n, v) => { n.eulerAngles = v; }, eqVec3));

PropHandlerManager.register(EnumPropName.Scale,
    nodeProp<number>(n => n.scale, (n, v) => { n.scale = v; }));

PropHandlerManager.register(EnumPropName.Anchor,
    nodeProp<cc.Vec2>(
        n => cc.v2(n.anchorX, n.anchorY),
        (n, v) => n.setAnchorPoint(v),
        eqVec2,
    ));

PropHandlerManager.register(EnumPropName.Size,
    nodeProp<cc.Size>(
        n => { const s = n.getContentSize(); return cc.size(s.width, s.height); },
        (n, v) => { n.setContentSize(v); },
        eqSize,
    ));

PropHandlerManager.register(EnumPropName.Color,
    nodeProp<cc.Color>(
        n => { const c = n.color; return cc.color(c.r, c.g, c.b, c.a); },
        (n, v) => { n.color = v; },
        eqColor,
    ));

PropHandlerManager.register(EnumPropName.Opacity,
    nodeProp<number>(n => n.opacity, (n, v) => { n.opacity = v; }));

// ---- Label 组件 ----
PropHandlerManager.register(EnumPropName.LabelString, compProp(cc.Label, "string"));
PropHandlerManager.register(EnumPropName.LabelFontSize, compProp(cc.Label, "fontSize"));
PropHandlerManager.register(EnumPropName.LabelLineHeight, compProp(cc.Label, "lineHeight"));
PropHandlerManager.register(EnumPropName.LabelSpacingX, compProp(cc.Label, "spacingX"));
PropHandlerManager.register(EnumPropName.LabelWrapEnable, compProp(cc.Label, "enableWrapText"));
PropHandlerManager.register(EnumPropName.Font, compProp(cc.Label, "font"));

// ---- LabelOutline (颜色需 clone) ----
PropHandlerManager.register(EnumPropName.LabelOutlineColor, {
    getValue: (node) => {
        const c = node.getComponent(cc.LabelOutline);
        if (!c) return undefined;
        const col = c.color;
        return cc.color(col.r, col.g, col.b, col.a);
    },
    setValue: (node, value) => {
        const c = node.getComponent(cc.LabelOutline);
        if (c) c.color = value as cc.Color;
    },
    getDefaultValue: (node) => {
        const c = node.getComponent(cc.LabelOutline);
        if (!c) return undefined;
        const col = c.color;
        return cc.color(col.r, col.g, col.b, col.a);
    },
    isEqual: eqColor,
});

// ---- Sprite ----
PropHandlerManager.register(EnumPropName.SpriteFrame, compProp(cc.Sprite, "spriteFrame"));
PropHandlerManager.register(EnumPropName.SpriteFillRange, compProp(cc.Sprite, "fillRange"));

// ---- 其他单字段组件 ----
PropHandlerManager.register(EnumPropName.SliderProgress, compProp(cc.Slider, "progress"));
PropHandlerManager.register(EnumPropName.EditboxString, compProp(cc.EditBox, "string"));
PropHandlerManager.register(EnumPropName.ButtonInteractable, compProp(cc.Button, "interactable"));
PropHandlerManager.register(EnumPropName.ProgressBarProgress, compProp(cc.ProgressBar, "progress"));
PropHandlerManager.register(EnumPropName.ToggleIsChecked, compProp(cc.Toggle, "isChecked"));
PropHandlerManager.register(EnumPropName.RichTextString, compProp(cc.RichText, "string"));
PropHandlerManager.register(EnumPropName.ScrollViewEnabled, compProp(cc.ScrollView, "enabled"));
PropHandlerManager.register(EnumPropName.MaskEnabled, compProp(cc.Mask, "enabled"));

// ---- GrayScale (Cocos 2.x 需要走材质, 这里保留 stub 行为) ----
PropHandlerManager.register(EnumPropName.GrayScale, {
    getValue: (node) => {
        const sprite = node.getComponent(cc.Sprite);
        return sprite ? false : undefined;
    },
    setValue: (node, _value) => {
        const sprite = node.getComponent(cc.Sprite);
        if (sprite) {
            StateErrorManager.warn("GrayScale属性在Cocos Creator 2.x中需要通过材质实现");
        }
    },
    getDefaultValue: (node) => {
        const sprite = node.getComponent(cc.Sprite);
        return sprite ? false : undefined;
    },
    isEqual: eqStrict,
});

// ---- Widget (14 个统一 field 风格) ----
PropHandlerManager.register(EnumPropName.WidgetEnabled, compProp(cc.Widget, "enabled"));
PropHandlerManager.register(EnumPropName.WidgetAlignMode, compProp(cc.Widget, "alignMode"));
PropHandlerManager.register(EnumPropName.WidgetIsAlignTop, compProp(cc.Widget, "isAlignTop"));
PropHandlerManager.register(EnumPropName.WidgetIsAlignBottom, compProp(cc.Widget, "isAlignBottom"));
PropHandlerManager.register(EnumPropName.WidgetIsAlignLeft, compProp(cc.Widget, "isAlignLeft"));
PropHandlerManager.register(EnumPropName.WidgetIsAlignRight, compProp(cc.Widget, "isAlignRight"));
PropHandlerManager.register(EnumPropName.WidgetIsAlignHorizontalCenter, compProp(cc.Widget, "isAlignHorizontalCenter"));
PropHandlerManager.register(EnumPropName.WidgetIsAlignVerticalCenter, compProp(cc.Widget, "isAlignVerticalCenter"));
PropHandlerManager.register(EnumPropName.WidgetTop, compProp(cc.Widget, "top"));
PropHandlerManager.register(EnumPropName.WidgetBottom, compProp(cc.Widget, "bottom"));
PropHandlerManager.register(EnumPropName.WidgetLeft, compProp(cc.Widget, "left"));
PropHandlerManager.register(EnumPropName.WidgetRight, compProp(cc.Widget, "right"));
PropHandlerManager.register(EnumPropName.WidgetHorizontalCenter, compProp(cc.Widget, "horizontalCenter"));
PropHandlerManager.register(EnumPropName.WidgetVerticalCenter, compProp(cc.Widget, "verticalCenter"));
