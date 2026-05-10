import { EnumPropName } from "../StateEnum";
import { StateSelect } from "../StateSelect";

const { ccclass, property } = cc._decorator;

/**
 * 行为/交互组件属性分组 - inspector 中显示为可折叠区域 (M2 拆自 StateComponentProps)
 *
 * 包含 7 个交互组件属性:
 * 1. SliderProgress
 * 2. EditboxString
 * 3. ButtonInteractable
 * 4. ProgressBarProgress
 * 5. ToggleIsChecked
 * 6. ScrollViewEnabled
 * 7. MaskEnabled
 */
@ccclass("StateBehaviorProps")
export class StateBehaviorProps {
    public owner: StateSelect = null;

    @property({
        displayName: "滑动条进度 (SliderProgress)",
        tooltip: "Slider 组件的进度值",
        visible: function (this: StateBehaviorProps) {
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
        visible: function (this: StateBehaviorProps) {
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
        displayName: "按钮交互 (ButtonInteractable)",
        tooltip: "Button 组件的交互开关",
        visible: function (this: StateBehaviorProps) {
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
        visible: function (this: StateBehaviorProps) {
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
        visible: function (this: StateBehaviorProps) {
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
        displayName: "滚动视图 (ScrollViewEnabled)",
        tooltip: "ScrollView 组件的启用状态",
        visible: function (this: StateBehaviorProps) {
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
        visible: function (this: StateBehaviorProps) {
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
