/**
 * W6-2a EnumPropName ↔ propRef 双向映射 (内部边界用).
 *
 * W6-2a 内部 Recording 计算路径走 propRef 字符串 (与 W6-1 PrefabIntrospection.listTrackableProps
 * 返回值同 shape), 但外部 API 签名仍是 EnumPropName 数字 (togglePropertyControl 等). 双 key 存储:
 *   - 内置 prop (能映射到 EnumPropName 数字) → ctrlData[ctrlId][state][数字 key]
 *   - 自定义 prop (无映射) → ctrlData[ctrlId][state][string propRef key]
 *
 * 映射数据源: assets/script/controller/StatePropHandlerV2.ts 的 register(...) 调用. 每条 enum 映射到
 * (getValue/setValue) 实际操作的 cc.Node 字段或 (cc.Component, fieldName).
 *
 * AMBIGUOUS 项 (复合字段, 无法一一映射): Position (x/y/z), Anchor (anchorX/anchorY),
 * Size (width/height), GrayScale (材质 stub) — 这些 EnumPropName 仍走老路径 (写数字 key),
 * 不在本映射表里. 自定义 prop 走 string key 路径不受影响.
 */

import { EnumPropName } from "./StateEnumV2";

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

    // ---- AMBIGUOUS — 不在主映射表 (W6-2c2: 改走 AMBIGUOUS_ENUM_TO_PROPREF 单一 propRef 整体存) ----
    // EnumPropName.Position (2): 老 PropHandler 行为 n.position = vec3 整体写, 用单一 propRef 'cc.Node.position'
    // EnumPropName.Anchor (8): 老 PropHandler 行为 n.setAnchorPoint(vec2) 整体写, 用 'cc.Node.anchorPoint'
    // EnumPropName.Size (9): 老 PropHandler 行为 n.setContentSize(size) 整体写, 用 'cc.Node.contentSize'
    // EnumPropName.GrayScale (15): cocos 2.x 走材质 stub, 无单一字段, 进 LEGACY_DROPPED_ENUMS 静默丢
};

/**
 * W6-2c2: AMBIGUOUS 复合 prop → propRef 整体存映射 (Position/Anchor/Size 三项).
 *
 * 设计依据 (StatePropHandlerV2.ts): 老 PropHandler 对这三项都是整体读写
 *   - Position handler: `n.position = vec3` (整 Vec3)
 *   - Anchor handler:   `n.setAnchorPoint(vec2)` (整 Vec2)
 *   - Size handler:     `n.setContentSize(size)` (整 Size)
 * 所以 W6-2c2 把这三项数据以"单一 propRef 整体存"方式落到 ctrlData, 跟老行为一致.
 *
 * 与 ENUM_TO_PROPREF 的区别: 内置 prop 36 项可以从 cc.Node[fieldName] 直接读,
 * AMBIGUOUS 3 项是 cocos 复合字段无法走 fieldName 路径但能整体读写.
 * 两表合并由 enumToPropRef() 提供.
 */
export const AMBIGUOUS_ENUM_TO_PROPREF: { [enumVal: number]: string } = {
    [EnumPropName.Position]: "cc.Node.position",
    [EnumPropName.Anchor]: "cc.Node.anchorPoint",
    [EnumPropName.Size]: "cc.Node.contentSize",
};

/**
 * W6-2c2: 合并 helper — ENUM_TO_PROPREF 36 项 + AMBIGUOUS 3 项 = 39 项 EnumPropName → propRef 映射.
 *
 * 用于:
 *   - migrateLegacyCtrlData: 数字 key → string propRef key 迁移
 *   - StateSelectV2.readPropByEnum / writePropByEnum: 双 key 读写桥
 *
 * 未命中 (e.g. GrayScale=15) 返回 undefined, 调用方按需处理.
 */
export function enumToPropRef(propType: number): string | undefined {
    return ENUM_TO_PROPREF[propType] !== undefined
        ? ENUM_TO_PROPREF[propType]
        : AMBIGUOUS_ENUM_TO_PROPREF[propType];
}

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
    // W6-2c2: AMBIGUOUS 3 项也加入反查 ('cc.Node.position' → Position 等)
    for (const k of Object.keys(AMBIGUOUS_ENUM_TO_PROPREF)) {
        const num = Number(k);
        if (Number.isFinite(num)) out[AMBIGUOUS_ENUM_TO_PROPREF[num]] = num;
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

/**
 * W6-2c1: 已废弃的 EnumPropName 数字常量列表 (无对应 propRef, 老 .fire 内若有该 enum 的数据应静默丢).
 *
 * - GrayScale (15): cocos 2.x 走材质 stub, 无单一字段; 已无运行时支持. 老场景里若历史误设的
 *   GrayScale 数据存在 _ctrlData 中, __preload 时由 migrateLegacyCtrlData 静默清掉.
 *
 * c2 加 ENUM_TO_PROPREF 36 项迁移路径 (number → string key) 时, 也优先检查此列表
 * (避免误迁废弃 enum). c1 范围: 仅此一项, 不动 ENUM_TO_PROPREF / AMBIGUOUS.
 */
export const LEGACY_DROPPED_ENUMS: number[] = [EnumPropName.GrayScale];

/**
 * W6-axis-decomp X 方案: AMBIGUOUS 复合 propRef → 子项拆解函数.
 *
 * 设计动机: W6-2a 双轨设计 ("Position" 整体 propRef + cc.Node.x/y/z 子项 propRef) 在 cc.Node 复合字段上
 * 存在固有冲突 — 用户排子项 cc.Node.x 只断 propRef 字符串路径, 但整体 "cc.Node.position" 路径仍跟踪 →
 * 切 state 时 x 跟着 Vec3 整体被恢复. X 方案: 彻底废弃整体路径, 让 cc.Node.x/y/z 子项独立接入.
 *
 * 拆解三项 (其它 cc.Node 字段如 Euler/Color 仍走整体, 因为没拆分的对应子项 EnumPropName):
 *   - 'cc.Node.position' (Vec3) → x/y/z 三子项
 *   - 'cc.Node.anchorPoint' (Vec2) → anchorX/anchorY 两子项
 *   - 'cc.Node.contentSize' (Size) → width/height 两子项
 *
 * 调用方: migrateLegacyCtrlData — 检测 propData 内层有整体 Vec3/Vec2/Size 值时调拆解, 升级为多子项 key.
 *
 * 守卫: 值必须形似 Vec3 ({x,y,z}) / Vec2 ({x,y}) / Size ({width,height}). string/null/undefined 不动
 * (e.g. W6.legacyMigration.test.ts 的 "stub-pos" 字符串 stub 不应被解构, 保持兼容).
 */
export const AMBIGUOUS_DECOMPOSE: { [propRef: string]: (value: any) => Array<[string, any]> | null } = {
    "cc.Node.position": (v: any) => {
        if (!v || typeof v !== "object") return null;
        if (typeof v.x !== "number" || typeof v.y !== "number" || typeof v.z !== "number") return null;
        return [
            ["cc.Node.x", v.x],
            ["cc.Node.y", v.y],
            ["cc.Node.z", v.z],
        ];
    },
    "cc.Node.anchorPoint": (v: any) => {
        if (!v || typeof v !== "object") return null;
        if (typeof v.x !== "number" || typeof v.y !== "number") return null;
        return [
            ["cc.Node.anchorX", v.x],
            ["cc.Node.anchorY", v.y],
        ];
    },
    "cc.Node.contentSize": (v: any) => {
        if (!v || typeof v !== "object") return null;
        if (typeof v.width !== "number" || typeof v.height !== "number") return null;
        return [
            ["cc.Node.width", v.width],
            ["cc.Node.height", v.height],
        ];
    },
    // cocos 2.x cc.Node.scale 是 Vec3 (有 scaleX/scaleY/scaleZ 子项 getter/setter)
    "cc.Node.scale": (v: any) => {
        if (v == null) return null;
        // scale 可能是 number (uniform scale) 或 Vec3
        if (typeof v === "number") {
            return [
                ["cc.Node.scaleX", v],
                ["cc.Node.scaleY", v],
                ["cc.Node.scaleZ", v],
            ];
        }
        if (typeof v !== "object") return null;
        if (typeof v.x !== "number" || typeof v.y !== "number") return null;
        return [
            ["cc.Node.scaleX", v.x],
            ["cc.Node.scaleY", v.y],
            ["cc.Node.scaleZ", typeof v.z === "number" ? v.z : 1],
        ];
    },
    // cocos 2.x cc.Node.eulerAngles 是 Vec3 (rotationX/rotationY 子项, z 不常用)
    "cc.Node.eulerAngles": (v: any) => {
        if (!v || typeof v !== "object") return null;
        if (typeof v.x !== "number" || typeof v.y !== "number") return null;
        return [
            ["cc.Node.rotationX", v.x],
            ["cc.Node.rotationY", v.y],
        ];
    },
};

/**
 * W6-axis-decomp: 判断 propRef 是否是 AMBIGUOUS 整体 propRef (可拆解为子项).
 * 用于 autoOptInCustomComponentProps 跳过整体 propRef 接入 (只接入 listTrackableProps 内的 x/y/z 子项).
 */
export function isAmbiguousAggregatePropRef(propRef: string): boolean {
    return AMBIGUOUS_DECOMPOSE[propRef] !== undefined;
}
