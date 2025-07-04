import { EnumPropName } from "./StateEnum";
import { TPropValue } from "./StateSelect";

/** 🔧 扩展指南：添加新组件支持
 * 
 * 添加新属性处理器只需3步：
 * 
 * 1. 在StateEnum.ts中添加枚举值
 * 2. 创建对应的PropHandler类，实现IPropHandler接口
 * 3. 注册到PropHandlerManager
 * 
 * 示例 - 添加Button组件支持：
 * 
 * ```typescript
 * class ButtonPropHandler implements IPropHandler {
 *     getValue(node: cc.Node) { 
 *         const button = node.getComponent(cc.Button);
 *         return button ? button.interactable : undefined; 
 *     }
 *     setValue(node: cc.Node, value: TPropValue) { 
 *         const button = node.getComponent(cc.Button);
 *         if (button) button.interactable = value as boolean; 
 *     }
 *     getDefaultValue(node: cc.Node) { return this.getValue(node); }
 * }
 * 
 * PropHandlerManager.register(EnumPropName.Button_Interactable, new ButtonPropHandler());
 * ```
 * 
 * 这样设计极大地简化了扩展新组件的流程！
 */

/** 
 * 🔧 属性处理器接口 - 定义所有属性处理器必须实现的标准接口
 * 
 * 这是属性处理器系统的核心抽象：
 * 1. 统一的属性访问方式
 * 2. 类型安全的属性操作
 * 3. 可扩展的属性处理机制
 * 
 * 所有属性处理器都必须实现这三个方法，确保系统的一致性和可预测性
 */
interface IPropHandler {
    /** 获取属性值 */
    getValue(node: cc.Node): TPropValue | undefined;
    /** 设置属性值 */
    setValue(node: cc.Node, value: TPropValue): void;
    /** 获取默认值 */
    getDefaultValue(node: cc.Node): TPropValue | undefined;
}

/** 
 * 🔧 属性处理器管理类 - 统一管理所有属性处理器的注册和访问
 * 
 * 核心优势：
 * 1. 集中管理：所有属性处理器统一注册和管理
 * 2. 类型安全：基于枚举的类型检查
 * 3. 易于扩展：新增属性只需实现接口并注册
 * 4. 性能优化：使用Map提供O(1)的查找效率
 */
export class PropHandlerManager {
    // 🔧 使用Map存储处理器，提供高效的O(1)查找性能
    private static handlers = new Map<EnumPropName, IPropHandler>();

    /** 
     * 🔧 注册属性处理器 - 将属性处理器与对应的属性类型关联
     * @param propType 属性类型枚举
     * @param handler 属性处理器实例
     */
    static register(propType: EnumPropName, handler: IPropHandler) {
        this.handlers.set(propType, handler);
    }

    /** 
     * 🔧 获取属性处理器 - 根据属性类型获取对应的处理器
     * @param propType 属性类型枚举
     * @returns 对应的属性处理器，如果没有则返回undefined
     */
    static getHandler(propType: EnumPropName): IPropHandler | undefined {
        return this.handlers.get(propType);
    }

    /** 获取属性值 */
    static getValue(propType: EnumPropName, node: cc.Node): TPropValue | undefined {
        const handler = this.getHandler(propType);
        return handler ? handler.getValue(node) : undefined;
    }

    /** 设置属性值 */
    static setValue(propType: EnumPropName, node: cc.Node, value: TPropValue): void {
        const handler = this.getHandler(propType);
        if (handler) {
            handler.setValue(node, value);
        }
    }

    /** 获取默认值 */
    static getDefaultValue(propType: EnumPropName, node: cc.Node): TPropValue | undefined {
        const handler = this.getHandler(propType);
        return handler ? handler.getDefaultValue(node) : undefined;
    }
}

/** 🔧 基础属性处理器实现 */
class ActivePropHandler implements IPropHandler {
    getValue(node: cc.Node) { return node.active; }
    setValue(node: cc.Node, value: TPropValue) { node.active = value as boolean; }
    getDefaultValue(node: cc.Node) { return node.active; }
}

class PositionPropHandler implements IPropHandler {
    getValue(node: cc.Node) { return cc.v3(node.position); }
    setValue(node: cc.Node, value: TPropValue) { node.position = value as cc.Vec3; }
    getDefaultValue(node: cc.Node) { return cc.v3(node.position); }
}

class EulerPropHandler implements IPropHandler {
    getValue(node: cc.Node) { return cc.v3(node.eulerAngles); }
    setValue(node: cc.Node, value: TPropValue) { node.eulerAngles = value as cc.Vec3; }
    getDefaultValue(node: cc.Node) { return cc.v3(node.eulerAngles); }
}

class ScalePropHandler implements IPropHandler {
    getValue(node: cc.Node) { return node.scale; }
    setValue(node: cc.Node, value: TPropValue) { node.scale = value as number; }
    getDefaultValue(node: cc.Node) { return node.scale; }
}

class AnchorPropHandler implements IPropHandler {
    getValue(node: cc.Node) { return cc.v2(node.anchorX, node.anchorY); }
    setValue(node: cc.Node, value: TPropValue) {
        const anchor = value as cc.Vec2;
        node.setAnchorPoint(anchor);
    }
    getDefaultValue(node: cc.Node) { return cc.v2(node.anchorX, node.anchorY); }
}

class SizePropHandler implements IPropHandler {
    getValue(node: cc.Node) {
        const size = node.getContentSize();
        return cc.size(size.width, size.height);
    }
    setValue(node: cc.Node, value: TPropValue) {
        node.setContentSize(value as cc.Size);
    }
    getDefaultValue(node: cc.Node) {
        const size = node.getContentSize();
        return cc.size(size.width, size.height);
    }
}

class ColorPropHandler implements IPropHandler {
    getValue(node: cc.Node) {
        const color = node.color;
        return cc.color(color.r, color.g, color.b, color.a);
    }
    setValue(node: cc.Node, value: TPropValue) { node.color = value as cc.Color; }
    getDefaultValue(node: cc.Node) {
        const color = node.color;
        return cc.color(color.r, color.g, color.b, color.a);
    }
}

class OpacityPropHandler implements IPropHandler {
    getValue(node: cc.Node) { return node.opacity; }
    setValue(node: cc.Node, value: TPropValue) { node.opacity = value as number; }
    getDefaultValue(node: cc.Node) { return node.opacity; }
}

/** 🔧 组件相关属性处理器 */
class LabelPropHandler implements IPropHandler {
    getValue(node: cc.Node) {
        const label = node.getComponent(cc.Label);
        return label ? label.string : undefined;
    }
    setValue(node: cc.Node, value: TPropValue) {
        const label = node.getComponent(cc.Label);
        if (label) label.string = value as string;
    }
    getDefaultValue(node: cc.Node) { return this.getValue(node); }
}

class FontPropHandler implements IPropHandler {
    getValue(node: cc.Node) {
        const label = node.getComponent(cc.Label);
        return label ? label.font : undefined;
    }
    setValue(node: cc.Node, value: TPropValue) {
        const label = node.getComponent(cc.Label);
        if (label) label.font = value as cc.Font;
    }
    getDefaultValue(node: cc.Node) { return this.getValue(node); }
}

class LabelOutlinePropHandler implements IPropHandler {
    getValue(node: cc.Node) {
        const labelOutline = node.getComponent(cc.LabelOutline);
        if (!labelOutline) return undefined;
        const color = labelOutline.color;
        return cc.color(color.r, color.g, color.b, color.a);
    }
    setValue(node: cc.Node, value: TPropValue) {
        const labelOutline = node.getComponent(cc.LabelOutline);
        if (labelOutline) labelOutline.color = value as cc.Color;
    }
    getDefaultValue(node: cc.Node) { return this.getValue(node); }
}

class SpriteFramePropHandler implements IPropHandler {
    getValue(node: cc.Node) {
        const sprite = node.getComponent(cc.Sprite);
        return sprite ? sprite.spriteFrame : undefined;
    }
    setValue(node: cc.Node, value: TPropValue) {
        const sprite = node.getComponent(cc.Sprite);
        if (sprite) sprite.spriteFrame = value as cc.SpriteFrame;
    }
    getDefaultValue(node: cc.Node) { return this.getValue(node); }
}

class SliderPropHandler implements IPropHandler {
    getValue(node: cc.Node) {
        const slider = node.getComponent(cc.Slider);
        return slider ? slider.progress : undefined;
    }
    setValue(node: cc.Node, value: TPropValue) {
        const slider = node.getComponent(cc.Slider);
        if (slider) slider.progress = value as number;
    }
    getDefaultValue(node: cc.Node) { return this.getValue(node); }
}

class EditBoxPropHandler implements IPropHandler {
    getValue(node: cc.Node) {
        const editbox = node.getComponent(cc.EditBox);
        return editbox ? editbox.string : undefined;
    }
    setValue(node: cc.Node, value: TPropValue) {
        const editbox = node.getComponent(cc.EditBox);
        if (editbox) editbox.string = value as string;
    }
    getDefaultValue(node: cc.Node) { return this.getValue(node); }
}

class GrayScalePropHandler implements IPropHandler {
    getValue(node: cc.Node) {
        const sprite = node.getComponent(cc.Sprite);
        if (!sprite) return undefined;
        // 在 2.x 中，灰度需要通过材质实现，这里暂时返回 false
        return false;
    }
    setValue(node: cc.Node, value: TPropValue) {
        const sprite = node.getComponent(cc.Sprite);
        // 在 2.x 中，灰度需要通过材质实现，这里暂时不做处理
        if (sprite && CC_EDITOR) {
            console.warn('GrayScale属性在Cocos Creator 2.x中需要通过材质实现');
        }
    }
    getDefaultValue(node: cc.Node) { return this.getValue(node); }
}

// 🔧 注册所有属性处理器
PropHandlerManager.register(EnumPropName.Active, new ActivePropHandler());
PropHandlerManager.register(EnumPropName.Position, new PositionPropHandler());
PropHandlerManager.register(EnumPropName.Euler, new EulerPropHandler());
PropHandlerManager.register(EnumPropName.Scale, new ScalePropHandler());
PropHandlerManager.register(EnumPropName.Anchor, new AnchorPropHandler());
PropHandlerManager.register(EnumPropName.Size, new SizePropHandler());
PropHandlerManager.register(EnumPropName.Color, new ColorPropHandler());
PropHandlerManager.register(EnumPropName.Opacity, new OpacityPropHandler());
PropHandlerManager.register(EnumPropName.Label_String, new LabelPropHandler());
PropHandlerManager.register(EnumPropName.Font, new FontPropHandler());
PropHandlerManager.register(EnumPropName.LabelOutline_Color, new LabelOutlinePropHandler());
PropHandlerManager.register(EnumPropName.SpriteFrame, new SpriteFramePropHandler());
PropHandlerManager.register(EnumPropName.Slider_Progress, new SliderPropHandler());
PropHandlerManager.register(EnumPropName.Editbox_String, new EditBoxPropHandler());
PropHandlerManager.register(EnumPropName.GrayScale, new GrayScalePropHandler());

