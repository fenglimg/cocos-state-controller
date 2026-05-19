import { EnumPropName } from "../StateEnum";
import { StateSelect } from "../StateSelect";

const { ccclass, property } = cc._decorator;
/** 组件属性分组 - inspector 中显示为可折叠区域 */
@ccclass("StateComponentProps")
export class StateComponentProps {
    public owner: StateSelect = null;

    @property({
        displayName: "文本内容 (LabelString)",
        tooltip: "Label 组件的文本内容",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelString);
        },
    })
    public get propLabelString() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelString) : false;
    }

    public set propLabelString(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelString, v);
    }

    @property({
        displayName: "文本字号 (LabelFontSize)",
        tooltip: "Label 组件的字体大小",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelFontSize);
        },
    })
    public get propLabelFontSize() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelFontSize) : false;
    }

    public set propLabelFontSize(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelFontSize, v);
    }

    @property({
        displayName: "文本行高 (LabelLineHeight)",
        tooltip: "Label 组件的行高",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelLineHeight);
        },
    })
    public get propLabelLineHeight() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelLineHeight) : false;
    }

    public set propLabelLineHeight(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelLineHeight, v);
    }

    @property({
        displayName: "文本字距 (LabelSpacingX)",
        tooltip: "Label 组件的字符间距",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelSpacingX);
        },
    })
    public get propLabelSpacingX() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelSpacingX) : false;
    }

    public set propLabelSpacingX(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelSpacingX, v);
    }

    @property({
        displayName: "文本换行 (LabelWrapEnable)",
        tooltip: "Label 组件的自动换行开关",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelWrapEnable);
        },
    })
    public get propLabelWrapEnable() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelWrapEnable) : false;
    }

    public set propLabelWrapEnable(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelWrapEnable, v);
    }

    @property({
        displayName: "图片 (SpriteFrame)",
        tooltip: "Sprite 组件的图片资源",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.SpriteFrame);
        },
    })
    public get propSpriteFrame() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.SpriteFrame) : false;
    }

    public set propSpriteFrame(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.SpriteFrame, v);
    }

    @property({
        displayName: "填充范围 (SpriteFillRange)",
        tooltip: "Sprite 组件的填充范围",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.SpriteFillRange);
        },
    })
    public get propSpriteFillRange() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.SpriteFillRange) : false;
    }

    public set propSpriteFillRange(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.SpriteFillRange, v);
    }

    @property({
        displayName: "字体 (Font)",
        tooltip: "Label 组件的字体资源",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.Font);
        },
    })
    public get propFont() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.Font) : false;
    }

    public set propFont(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.Font, v);
    }

    @property({
        displayName: "描边颜色 (LabelOutlineColor)",
        tooltip: "Label 描边组件的颜色",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.LabelOutlineColor);
        },
    })
    public get propLabelOutlineColor() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.LabelOutlineColor) : false;
    }

    public set propLabelOutlineColor(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.LabelOutlineColor, v);
    }

    @property({
        displayName: "滑动条进度 (SliderProgress)",
        tooltip: "Slider 组件的进度值",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.SliderProgress);
        },
    })
    public get propSliderProgress() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.SliderProgress) : false;
    }

    public set propSliderProgress(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.SliderProgress, v);
    }

    @property({
        displayName: "输入框文本 (EditboxString)",
        tooltip: "EditBox 组件的文本内容",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.EditboxString);
        },
    })
    public get propEditboxString() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.EditboxString) : false;
    }

    public set propEditboxString(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.EditboxString, v);
    }

    @property({
        displayName: "灰度效果 (GrayScale)",
        tooltip: "节点的灰度显示效果",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.GrayScale);
        },
    })
    public get propGrayScale() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.GrayScale) : false;
    }

    public set propGrayScale(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.GrayScale, v);
    }

    @property({
        displayName: "按钮交互 (ButtonInteractable)",
        tooltip: "Button 组件的交互开关",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.ButtonInteractable);
        },
    })
    public get propButtonInteractable() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.ButtonInteractable) : false;
    }

    public set propButtonInteractable(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.ButtonInteractable, v);
    }

    @property({
        displayName: "进度条进度 (ProgressBarProgress)",
        tooltip: "ProgressBar 组件的进度值",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.ProgressBarProgress);
        },
    })
    public get propProgressBarProgress() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.ProgressBarProgress) : false;
    }

    public set propProgressBarProgress(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.ProgressBarProgress, v);
    }

    @property({
        displayName: "Toggle选中 (ToggleIsChecked)",
        tooltip: "Toggle 组件的选中状态",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.ToggleIsChecked);
        },
    })
    public get propToggleIsChecked() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.ToggleIsChecked) : false;
    }

    public set propToggleIsChecked(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.ToggleIsChecked, v);
    }

    @property({
        displayName: "富文本内容 (RichTextString)",
        tooltip: "RichText 组件的文本内容",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.RichTextString);
        },
    })
    public get propRichTextString() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.RichTextString) : false;
    }

    public set propRichTextString(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.RichTextString, v);
    }

    @property({
        displayName: "滚动视图 (ScrollViewEnabled)",
        tooltip: "ScrollView 组件的启用状态",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.ScrollViewEnabled);
        },
    })
    public get propScrollViewEnabled() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.ScrollViewEnabled) : false;
    }

    public set propScrollViewEnabled(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.ScrollViewEnabled, v);
    }

    @property({
        displayName: "遮罩启用 (MaskEnabled)",
        tooltip: "Mask 组件的启用状态",
        visible: function (this: StateComponentProps) {
            return this.owner && this.owner.isPropertyAvailable(EnumPropName.MaskEnabled);
        },
    })
    public get propMaskEnabled() {
        return this.owner ? this.owner.isPropertyControlled(EnumPropName.MaskEnabled) : false;
    }

    public set propMaskEnabled(v: boolean) {
        if (this.owner && CC_EDITOR) this.owner.togglePropertyControl(EnumPropName.MaskEnabled, v);
    }
}
