/**
 * W6-2a EnumPropName ↔ propRef 双向映射 (内部边界用).
 *
 * W6-2a 内部 Recording 计算路径走 propRef 字符串 (与 W6-1 PrefabIntrospection.listTrackableProps
 * 返回值同 shape), 但外部 API 签名仍是 EnumPropName 数字 (togglePropertyControl 等). 双 key 存储:
 *   - 内置 prop (能映射到 EnumPropName 数字) → ctrlData[ctrlId][state][数字 key]
 *   - 自定义 prop (无映射) → ctrlData[ctrlId][state][string propRef key]
 *
 * 映射数据源: assets/script/controller/StatePropHandler.ts 的 register(...) 调用. 每条 enum 映射到
 * (getValue/setValue) 实际操作的 cc.Node 字段或 (cc.Component, fieldName).
 *
 * AMBIGUOUS 项 (复合字段, 无法一一映射): Position (x/y/z), Anchor (anchorX/anchorY),
 * Size (width/height), GrayScale (材质 stub) — 这些 EnumPropName 仍走老路径 (写数字 key),
 * 不在本映射表里. 自定义 prop 走 string key 路径不受影响.
 */

import { EnumPropName } from "./StateEnum";

/**
 * EnumPropName 数字 → propRef 字符串.
 * 注意: 不含 AMBIGUOUS 项. listEnumMappablePropRefs() 用此表过滤已被内置路径覆盖的 propRef.
 */
export const ENUM_TO_PROPREF: { [enumVal: number]: string } = {
    // ---- cc.Node 内置字段 ----
    [EnumPropName.Active]: "cc.Node.active",
    [EnumPropName.Color]: "cc.Node.color",
    [EnumPropName.Opacity]: "cc.Node.opacity",
    [EnumPropName.Euler]: "cc.Node.eulerAngles",
    [EnumPropName.Scale]: "cc.Node.scale",

    // ---- cc.Label ----
    [EnumPropName.LabelString]: "cc.Label.string",
    [EnumPropName.LabelFontSize]: "cc.Label.fontSize",
    [EnumPropName.LabelLineHeight]: "cc.Label.lineHeight",
    [EnumPropName.LabelSpacingX]: "cc.Label.spacingX",
    [EnumPropName.LabelWrapEnable]: "cc.Label.enableWrapText",
    [EnumPropName.Font]: "cc.Label.font",

    // ---- cc.LabelOutline ----
    [EnumPropName.LabelOutlineColor]: "cc.LabelOutline.color",

    // ---- cc.Sprite ----
    [EnumPropName.SpriteFrame]: "cc.Sprite.spriteFrame",
    [EnumPropName.SpriteFillRange]: "cc.Sprite.fillRange",

    // ---- 其他单字段组件 ----
    [EnumPropName.SliderProgress]: "cc.Slider.progress",
    [EnumPropName.EditboxString]: "cc.EditBox.string",
    [EnumPropName.ButtonInteractable]: "cc.Button.interactable",
    [EnumPropName.ProgressBarProgress]: "cc.ProgressBar.progress",
    [EnumPropName.ToggleIsChecked]: "cc.Toggle.isChecked",
    [EnumPropName.RichTextString]: "cc.RichText.string",
    [EnumPropName.ScrollViewEnabled]: "cc.ScrollView.enabled",
    [EnumPropName.MaskEnabled]: "cc.Mask.enabled",

    // ---- cc.Widget ----
    [EnumPropName.WidgetEnabled]: "cc.Widget.enabled",
    [EnumPropName.WidgetAlignMode]: "cc.Widget.alignMode",
    [EnumPropName.WidgetIsAlignTop]: "cc.Widget.isAlignTop",
    [EnumPropName.WidgetIsAlignBottom]: "cc.Widget.isAlignBottom",
    [EnumPropName.WidgetIsAlignLeft]: "cc.Widget.isAlignLeft",
    [EnumPropName.WidgetIsAlignRight]: "cc.Widget.isAlignRight",
    [EnumPropName.WidgetIsAlignHorizontalCenter]: "cc.Widget.isAlignHorizontalCenter",
    [EnumPropName.WidgetIsAlignVerticalCenter]: "cc.Widget.isAlignVerticalCenter",
    [EnumPropName.WidgetTop]: "cc.Widget.top",
    [EnumPropName.WidgetBottom]: "cc.Widget.bottom",
    [EnumPropName.WidgetLeft]: "cc.Widget.left",
    [EnumPropName.WidgetRight]: "cc.Widget.right",
    [EnumPropName.WidgetHorizontalCenter]: "cc.Widget.horizontalCenter",
    [EnumPropName.WidgetVerticalCenter]: "cc.Widget.verticalCenter",

    // ---- AMBIGUOUS — 不在映射表 ----
    // EnumPropName.Position (2): cc.Vec3 持有 (x/y/z), __props__ 是 x/y/z 三个独立 prop
    // EnumPropName.Anchor (8): cc.Vec2 持有 (anchorX/anchorY), __props__ 是两个分开
    // EnumPropName.Size (9): cc.Size 持有 (width/height), __props__ 是两个分开
    // EnumPropName.GrayScale (15): cocos 2.x 走材质 stub, 无单一字段
};

/**
 * propRef 字符串 → EnumPropName 数字 (反向). 用于 W6-2c 删 EnumPropName 时把老 number key
 * 改写成 string key (本 task 不删, 仅占位提供反查能力).
 *
 * 含 36 条 (AMBIGUOUS 4 条不在内, 不影响内置 prop 走老路径).
 */
export const PROPREF_TO_ENUM: { [propRef: string]: number } = (function () {
    const out: { [k: string]: number } = {};
    for (const k of Object.keys(ENUM_TO_PROPREF)) {
        const num = Number(k);
        if (Number.isFinite(num)) out[ENUM_TO_PROPREF[num]] = num;
    }
    return out;
})();

/**
 * 已经被 EnumPropName 老路径覆盖的 propRef 集合 (即在 ENUM_TO_PROPREF 值集合中).
 * 用于 __preload 中筛选"剩余自定义 propRef"——从 listTrackableProps 结果减去这些, 剩下的
 * 走 string key 路径接入.
 */
export function isEnumMappedPropRef(propRef: string): boolean {
    return PROPREF_TO_ENUM[propRef] !== undefined;
}
