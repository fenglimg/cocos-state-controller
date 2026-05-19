/**
 * StateSelect Round-Trip 矩阵 (Phase 4.1)
 *
 * 验证主业务: 「stateA 设值α → stateB 设值β → 切回 stateA 应恢复 α, 切到 stateB 应恢复 β」
 *
 * 覆盖 EnumPropName 中除 Non(0) 之外全部受支持的 prop 类型, 跨四大类:
 *   - 节点 primitive (Active / Opacity / Scale)
 *   - 节点复合 (Position / Euler / Anchor / Size / Color)
 *   - 单字段组件 (Label / Sprite / Toggle / Slider / EditBox / Button /
 *     ProgressBar / RichText / ScrollView / Mask / LabelOutline)
 *   - Widget 组件 (14 个字段)
 *
 * 排除项 (单独说明, 不在矩阵内):
 *   - Non: 占位枚举, 无 PropHandler
 *   - GrayScale: 是 stub, setter 不真写值 (见 StatePropHandler.ts 注释)
 *   - SpriteFrame / Font: 需要真 cc.SpriteFrame / cc.Font 实例, 在 jest 环境造价大,
 *     后续单独写一个小测试用 mock 实例验证
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {},
        warn: () => {},
        error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
    };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ControllerMod = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelect");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnum");

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;

function setupCtrlAndSelect() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("RT_Root");
    const ctrlNode = new ccLocal.Node("RT_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("RT_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { root, ctrlNode, selectNode, ctrl, select };
}

interface PropCase {
    propType: number;
    /** 显示名 (it 标题用) */
    name: string;
    /** 测试前在 selectNode 上准备组件; 可选 */
    setup?: (node: any) => void;
    /** 写入待记录的值到 node / component */
    set: (node: any, v: any) => void;
    /** 读取当前 node / component 的值 */
    get: (node: any) => any;
    /** 两个 state 各自的目标值, 必须不同 */
    valueA: any;
    valueB: any;
    /** 自定义相等比较; 默认 Object.is */
    eq?: (a: any, b: any) => boolean;
}

function vec3Eq(a: any, b: any): boolean {
    return Math.abs(a.x - b.x) < 1e-5 && Math.abs(a.y - b.y) < 1e-5 && Math.abs(a.z - b.z) < 1e-5;
}
function colorEq(a: any, b: any): boolean {
    return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

function vec2Eq(a: any, b: any): boolean {
    return Math.abs(a.x - b.x) < 1e-5 && Math.abs(a.y - b.y) < 1e-5;
}
function sizeEq(a: any, b: any): boolean {
    return Math.abs(a.width - b.width) < 1e-5 && Math.abs(a.height - b.height) < 1e-5;
}

/** 单字段组件 case 快捷构造: 组件已挂上, 直接 (comp as any)[field] 读写. */
function compCase(propType: number, name: string, CompClass: any, field: string, valueA: any, valueB: any, eq?: (a: any, b: any) => boolean): PropCase {
    return {
        propType, name,
        setup: n => n.addComponent(CompClass),
        set: (n, v) => { (n.getComponent(CompClass) as any)[field] = v; },
        get: n => (n.getComponent(CompClass) as any)[field],
        valueA, valueB, eq,
    };
}

function buildCases(): PropCase[] {
    const ccL = (globalThis as any).cc;
    return [
        // ============ 节点 primitive (3) ============
        {
            propType: EnumPropName.Active, name: "Active",
            set: (n, v) => { n.active = v; }, get: n => n.active,
            valueA: false, valueB: true,
        },
        {
            propType: EnumPropName.Opacity, name: "Opacity",
            set: (n, v) => { n.opacity = v; }, get: n => n.opacity,
            valueA: 100, valueB: 200,
        },
        {
            propType: EnumPropName.Scale, name: "Scale",
            set: (n, v) => { n.scale = v; }, get: n => n.scale,
            valueA: 0.5, valueB: 2,
        },

        // ============ 节点复合 (5) ============
        {
            propType: EnumPropName.Position, name: "Position",
            set: (n, v) => { n.position = v; }, get: n => ccL.v3(n.position),
            valueA: ccL.v3(10, 20, 30), valueB: ccL.v3(-5, -10, -15),
            eq: vec3Eq,
        },
        {
            propType: EnumPropName.Euler, name: "Euler",
            set: (n, v) => { n.eulerAngles = v; }, get: n => ccL.v3(n.eulerAngles),
            valueA: ccL.v3(0, 0, 45), valueB: ccL.v3(0, 0, -90),
            eq: vec3Eq,
        },
        {
            propType: EnumPropName.Anchor, name: "Anchor",
            set: (n, v) => { n.setAnchorPoint(v); },
            get: n => ccL.v2(n.anchorX, n.anchorY),
            valueA: ccL.v2(0, 0), valueB: ccL.v2(1, 1),
            eq: vec2Eq,
        },
        {
            propType: EnumPropName.Size, name: "Size",
            set: (n, v) => { n.setContentSize(v); },
            get: n => { const s = n.getContentSize(); return ccL.size(s.width, s.height); },
            valueA: ccL.size(100, 50), valueB: ccL.size(300, 200),
            eq: sizeEq,
        },
        {
            propType: EnumPropName.Color, name: "Color",
            set: (n, v) => { n.color = v; },
            get: n => { const c = n.color; return ccL.color(c.r, c.g, c.b, c.a); },
            valueA: ccL.color(255, 0, 0, 255), valueB: ccL.color(0, 128, 255, 255),
            eq: colorEq,
        },

        // ============ Label 组件 (5) ============
        compCase(EnumPropName.LabelString, "LabelString", ccL.Label, "string", "alpha", "beta"),
        compCase(EnumPropName.LabelFontSize, "LabelFontSize", ccL.Label, "fontSize", 20, 48),
        compCase(EnumPropName.LabelLineHeight, "LabelLineHeight", ccL.Label, "lineHeight", 30, 60),
        compCase(EnumPropName.LabelSpacingX, "LabelSpacingX", ccL.Label, "spacingX", 0, 8),
        compCase(EnumPropName.LabelWrapEnable, "LabelWrapEnable", ccL.Label, "enableWrapText", false, true),

        // ============ LabelOutline 组件 (1) ============
        {
            propType: EnumPropName.LabelOutlineColor, name: "LabelOutlineColor",
            setup: n => { n.addComponent(ccL.Label); n.addComponent(ccL.LabelOutline); },
            set: (n, v) => { n.getComponent(ccL.LabelOutline).color = v; },
            get: n => { const c = n.getComponent(ccL.LabelOutline).color; return ccL.color(c.r, c.g, c.b, c.a); },
            valueA: ccL.color(10, 20, 30, 255), valueB: ccL.color(200, 100, 50, 255),
            eq: colorEq,
        },

        // ============ Sprite 组件 (1) ============
        // SpriteFrame 需要真 cc.SpriteFrame 实例, 在 jest 环境造价大, 单独 mock 测试覆盖
        compCase(EnumPropName.SpriteFillRange, "SpriteFillRange", ccL.Sprite, "fillRange", 0.2, 0.8),

        // ============ 单字段组件 (7) ============
        compCase(EnumPropName.SliderProgress, "SliderProgress", ccL.Slider, "progress", 0.25, 0.75),
        compCase(EnumPropName.EditboxString, "EditboxString", ccL.EditBox, "string", "input-a", "input-b"),
        compCase(EnumPropName.ButtonInteractable, "ButtonInteractable", ccL.Button, "interactable", false, true),
        compCase(EnumPropName.ProgressBarProgress, "ProgressBarProgress", ccL.ProgressBar, "progress", 0.1, 0.9),
        compCase(EnumPropName.ToggleIsChecked, "ToggleIsChecked", ccL.Toggle, "isChecked", false, true),
        compCase(EnumPropName.RichTextString, "RichTextString", ccL.RichText, "string", "rich-a", "rich-b"),
        compCase(EnumPropName.ScrollViewEnabled, "ScrollViewEnabled", ccL.ScrollView, "enabled", false, true),
        compCase(EnumPropName.MaskEnabled, "MaskEnabled", ccL.Mask, "enabled", false, true),

        // ============ Widget 组件 (14) ============
        compCase(EnumPropName.WidgetEnabled, "WidgetEnabled", ccL.Widget, "enabled", false, true),
        compCase(EnumPropName.WidgetAlignMode, "WidgetAlignMode", ccL.Widget, "alignMode", 0, 1),
        compCase(EnumPropName.WidgetIsAlignTop, "WidgetIsAlignTop", ccL.Widget, "isAlignTop", false, true),
        compCase(EnumPropName.WidgetIsAlignBottom, "WidgetIsAlignBottom", ccL.Widget, "isAlignBottom", false, true),
        compCase(EnumPropName.WidgetIsAlignLeft, "WidgetIsAlignLeft", ccL.Widget, "isAlignLeft", false, true),
        compCase(EnumPropName.WidgetIsAlignRight, "WidgetIsAlignRight", ccL.Widget, "isAlignRight", false, true),
        compCase(EnumPropName.WidgetIsAlignHorizontalCenter, "WidgetIsAlignHorizontalCenter", ccL.Widget, "isAlignHorizontalCenter", false, true),
        compCase(EnumPropName.WidgetIsAlignVerticalCenter, "WidgetIsAlignVerticalCenter", ccL.Widget, "isAlignVerticalCenter", false, true),
        compCase(EnumPropName.WidgetTop, "WidgetTop", ccL.Widget, "top", 10, 99),
        compCase(EnumPropName.WidgetBottom, "WidgetBottom", ccL.Widget, "bottom", 5, 55),
        compCase(EnumPropName.WidgetLeft, "WidgetLeft", ccL.Widget, "left", 3, 33),
        compCase(EnumPropName.WidgetRight, "WidgetRight", ccL.Widget, "right", 7, 77),
        compCase(EnumPropName.WidgetHorizontalCenter, "WidgetHorizontalCenter", ccL.Widget, "horizontalCenter", -10, 20),
        compCase(EnumPropName.WidgetVerticalCenter, "WidgetVerticalCenter", ccL.Widget, "verticalCenter", -5, 15),
    ];
}

function runRoundTrip(c: PropCase) {
    const env = setupCtrlAndSelect();
    if (c.setup) c.setup(env.selectNode);

    // state 0: 写值 α → 启用控制 → 记录
    env.ctrl.selectedIndex = 0;
    env.select.togglePropertyControl(c.propType, true);
    c.set(env.selectNode, c.valueA);
    (env.select as any).setDefaultProp(c.propType);

    // state 1: 写值 β → 启用控制 → 记录
    env.ctrl.selectedIndex = 1;
    env.select.togglePropertyControl(c.propType, true);
    c.set(env.selectNode, c.valueB);
    (env.select as any).setDefaultProp(c.propType);

    const eq = c.eq ?? Object.is;

    // 切回 state 0 → 期望恢复 α
    env.ctrl.selectedIndex = 0;
    expect(eq(c.get(env.selectNode), c.valueA)).toBe(true);

    // 切到 state 1 → 期望恢复 β
    env.ctrl.selectedIndex = 1;
    expect(eq(c.get(env.selectNode), c.valueB)).toBe(true);
}

describe("StateSelect round-trip matrix", () => {
    buildCases().forEach(c => {
        it(`${c.name}: state0=valueA → state1=valueB → 切回各自恢复`, () => {
            runRoundTrip(c);
        });
    });
});
