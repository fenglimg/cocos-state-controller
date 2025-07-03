import { EnumPropName } from "./StateEnum";
import { TPropValue } from "./StateSelect";

interface IPropHandler {
    /** 获取属性值 */
    getValue(node: cc.Node): TPropValue | undefined;
    /** 设置属性值 */
    setValue(node: cc.Node, value: TPropValue): void;
    /** 获取默认值 */
    getDefaultValue(node: cc.Node): TPropValue | undefined;
}

export class PropHandlerManager {
    private static handlers = new Map<EnumPropName, IPropHandler>();

    /** 注册属性处理器 */
    static register(propType: EnumPropName, handler: IPropHandler) {
        this.handlers.set(propType, handler);
    }

    /** 获取属性处理器 */
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

/** 🔧 新增：各种属性处理器实现 */
class ActivePropHandler implements IPropHandler {
    getValue(node: cc.Node) { return node.active; }
    setValue(node: cc.Node, value: TPropValue) { node.active = value as boolean; }
    getDefaultValue(node: cc.Node) { return node.active; }
}

class PositionPropHandler implements IPropHandler {
    getValue(node: cc.Node) { return node.position; }
    setValue(node: cc.Node, value: TPropValue) { node.position = value as cc.Vec3; }
    getDefaultValue(node: cc.Node) { return node.position; }
}

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

/** 🔧 新增：其他常用属性处理器 */
class EulerPropHandler implements IPropHandler {
    getValue(node: cc.Node) { return node.eulerAngles; }
    setValue(node: cc.Node, value: TPropValue) { node.eulerAngles = value as cc.Vec3; }
    getDefaultValue(node: cc.Node) { return node.eulerAngles; }
}

class ScalePropHandler implements IPropHandler {
    getValue(node: cc.Node) { return node.scale; }
    setValue(node: cc.Node, value: TPropValue) { node.scale = value as number; }
    getDefaultValue(node: cc.Node) { return node.scale; }
}

class ColorPropHandler implements IPropHandler {
    getValue(node: cc.Node) { return node.color; }
    setValue(node: cc.Node, value: TPropValue) { node.color = value as cc.Color; }
    getDefaultValue(node: cc.Node) { return node.color; }
}

class OpacityPropHandler implements IPropHandler {
    getValue(node: cc.Node) { return node.opacity; }
    setValue(node: cc.Node, value: TPropValue) { node.opacity = value as number; }
    getDefaultValue(node: cc.Node) { return node.opacity; }
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

class LabelOutlinePropHandler implements IPropHandler {
    getValue(node: cc.Node) {
        const labelOutline = node.getComponent(cc.LabelOutline);
        return labelOutline ? labelOutline.color : null;
    }
    setValue(node: cc.Node, value: TPropValue) {
        const labelOutline = node.getComponent(cc.LabelOutline);
        if (labelOutline) labelOutline.color = value as cc.Color;
    }
    getDefaultValue(node: cc.Node) { return this.getValue(node); }
}

class AnchorPropHandler implements IPropHandler {
    getValue(node: cc.Node) { return node.getAnchorPoint(); }
    setValue(node: cc.Node, value: TPropValue) { node.setAnchorPoint(value as cc.Vec2); }
    getDefaultValue(node: cc.Node) { return node.getAnchorPoint(); }
}

class SizePropHandler implements IPropHandler {
    getValue(node: cc.Node) { return node.getContentSize(); }
    setValue(node: cc.Node, value: TPropValue) { node.setContentSize(value as cc.Size); }
    getDefaultValue(node: cc.Node) { return node.getContentSize(); }
}



// 🔧 注册所有属性处理器
PropHandlerManager.register(EnumPropName.Active, new ActivePropHandler());
PropHandlerManager.register(EnumPropName.Position, new PositionPropHandler());
PropHandlerManager.register(EnumPropName.Label_String, new LabelPropHandler());
PropHandlerManager.register(EnumPropName.Slider_Progress, new SliderPropHandler());
PropHandlerManager.register(EnumPropName.Editbox_String, new EditBoxPropHandler());
PropHandlerManager.register(EnumPropName.Euler, new EulerPropHandler());
PropHandlerManager.register(EnumPropName.Scale, new ScalePropHandler());
PropHandlerManager.register(EnumPropName.Color, new ColorPropHandler());
PropHandlerManager.register(EnumPropName.Opacity, new OpacityPropHandler());
PropHandlerManager.register(EnumPropName.Font, new FontPropHandler());
PropHandlerManager.register(EnumPropName.SpriteFrame, new SpriteFramePropHandler());
PropHandlerManager.register(EnumPropName.LabelOutline, new LabelOutlinePropHandler());
PropHandlerManager.register(EnumPropName.Anchor, new AnchorPropHandler());
PropHandlerManager.register(EnumPropName.Size, new SizePropHandler());

/** 🔧 新增：属性处理器接口 */

/** 🔧 新增：属性处理器管理类 */

/** 🔧 扩展示例：添加新组件支持只需要3步
 * 
 * 步骤1: 在StateEnum.ts中添加枚举值
 * 步骤2: 创建对应的PropHandler类
 * 步骤3: 注册到PropHandlerManager
 * 
 * 例如添加Button组件支持：
 * 
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
 */