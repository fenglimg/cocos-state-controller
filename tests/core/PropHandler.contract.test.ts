/**
 * PropHandler 全契约测试 (Phase 2.1 [red] 安全网)
 *
 * 用真 cc 引擎覆盖 40 个 PropHandler 的:
 *   - getValue: 读取节点 / 组件当前属性值
 *   - setValue: 写入节点 / 组件属性值
 *   - getDefaultValue: 通常等同 getValue, 取当前值
 *
 * 边界:
 *   - null node 不应抛
 *   - 缺少所需组件 -> undefined (不抛)
 *   - 未注册的 propType -> undefined (PropHandlerManager.getValue 直接返回 undefined)
 *
 * 这是 Phase 2.1 把 41 个手写 handler 类改成表驱动重构的契约安全网。
 * 重构后所有断言必须仍然保持绿色。
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {}, warn: () => {}, error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
    };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PropMod = require("../../assets/script/controller/StatePropHandler");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnum");

const { PropHandlerManager } = PropMod;
const { EnumPropName } = EnumMod;

type PropSpec = {
    /** EnumPropName 名 (用于 describe 标题) */
    name: string;
    /** 枚举值 */
    propType: number;
    /** 在节点上准备所需组件并返回组件引用 (没有组件依赖的传 null) */
    attach: (node: any) => any;
    /** 通过 cc API 设置一个 "current value" 以供 getValue 读取 */
    setOnNode: (node: any, comp: any | null) => void;
    /** 预期 getValue 返回的 "current value" */
    currentValue: () => any;
    /** setValue 的样本输入 */
    setSample: () => any;
    /** 校验 setValue 之后节点 / 组件的状态符合预期 */
    expectAfterSet: (node: any, comp: any | null, sample: any) => void;
    /** 是否依赖组件 (用于"缺组件 -> undefined" 用例) */
    componentBacked: boolean;
};

function makeNode(name = "PropHost"): any {
    const ccLocal = (globalThis as any).cc;
    return new ccLocal.Node(name);
}

// 工具函数: 浅比较 vec/color/size 等 cc 复合类型
function expectVec3Like(got: any, exp: { x: number; y: number; z: number }) {
    expect(got).toBeTruthy();
    expect(got.x).toBeCloseTo(exp.x);
    expect(got.y).toBeCloseTo(exp.y);
    expect(got.z).toBeCloseTo(exp.z);
}

function expectVec2Like(got: any, exp: { x: number; y: number }) {
    expect(got).toBeTruthy();
    expect(got.x).toBeCloseTo(exp.x);
    expect(got.y).toBeCloseTo(exp.y);
}

function expectColorLike(got: any, exp: { r: number; g: number; b: number; a?: number }) {
    expect(got).toBeTruthy();
    expect(got.r).toBe(exp.r);
    expect(got.g).toBe(exp.g);
    expect(got.b).toBe(exp.b);
    if (exp.a !== undefined) expect(got.a).toBe(exp.a);
}

function expectSizeLike(got: any, exp: { width: number; height: number }) {
    expect(got).toBeTruthy();
    expect(got.width).toBeCloseTo(exp.width);
    expect(got.height).toBeCloseTo(exp.height);
}

const SPECS: PropSpec[] = (() => {
    const ccLocal = () => (globalThis as any).cc;
    const list: PropSpec[] = [
        // ---- Node-level ----
        {
            name: "Active",
            propType: EnumPropName.Active,
            attach: () => null,
            setOnNode: (n) => { n.active = true; },
            currentValue: () => true,
            setSample: () => false,
            expectAfterSet: (n, _c, v) => expect(n.active).toBe(v),
            componentBacked: false,
        },
        {
            name: "Position",
            propType: EnumPropName.Position,
            attach: () => null,
            setOnNode: (n) => { n.position = ccLocal().v3(10, 20, 30); },
            currentValue: () => ({ x: 10, y: 20, z: 30 }),
            setSample: () => ccLocal().v3(100, 200, 300),
            expectAfterSet: (n, _c, _v) => expectVec3Like(n.position, { x: 100, y: 200, z: 300 }),
            componentBacked: false,
        },
        {
            name: "Euler",
            propType: EnumPropName.Euler,
            attach: () => null,
            setOnNode: (n) => { n.eulerAngles = ccLocal().v3(0, 45, 90); },
            currentValue: () => ({ x: 0, y: 45, z: 90 }),
            setSample: () => ccLocal().v3(10, 20, 30),
            expectAfterSet: (n, _c, _v) => expectVec3Like(n.eulerAngles, { x: 10, y: 20, z: 30 }),
            componentBacked: false,
        },
        {
            name: "Scale",
            propType: EnumPropName.Scale,
            attach: () => null,
            setOnNode: (n) => { n.scale = 2; },
            currentValue: () => 2,
            setSample: () => 3,
            expectAfterSet: (n, _c, v) => expect(n.scale).toBe(v),
            componentBacked: false,
        },
        {
            name: "Anchor",
            propType: EnumPropName.Anchor,
            attach: () => null,
            setOnNode: (n) => { n.setAnchorPoint(0.25, 0.75); },
            currentValue: () => ({ x: 0.25, y: 0.75 }),
            setSample: () => ccLocal().v2(0.5, 0.5),
            expectAfterSet: (n) => expectVec2Like({ x: n.anchorX, y: n.anchorY }, { x: 0.5, y: 0.5 }),
            componentBacked: false,
        },
        {
            name: "Size",
            propType: EnumPropName.Size,
            attach: () => null,
            setOnNode: (n) => { n.setContentSize(120, 60); },
            currentValue: () => ({ width: 120, height: 60 }),
            setSample: () => ccLocal().size(200, 80),
            expectAfterSet: (n) => expectSizeLike(n.getContentSize(), { width: 200, height: 80 }),
            componentBacked: false,
        },
        {
            name: "Color",
            propType: EnumPropName.Color,
            attach: () => null,
            setOnNode: (n) => { n.color = ccLocal().color(255, 0, 0, 255); },
            currentValue: () => ({ r: 255, g: 0, b: 0 }),
            setSample: () => ccLocal().color(0, 255, 0, 200),
            expectAfterSet: (n) => expectColorLike(n.color, { r: 0, g: 255, b: 0 }),
            componentBacked: false,
        },
        {
            name: "Opacity",
            propType: EnumPropName.Opacity,
            attach: () => null,
            setOnNode: (n) => { n.opacity = 128; },
            currentValue: () => 128,
            setSample: () => 200,
            expectAfterSet: (n, _c, v) => expect(n.opacity).toBe(v),
            componentBacked: false,
        },

        // ---- Label component ----
        {
            name: "LabelString",
            propType: EnumPropName.LabelString,
            attach: (n) => n.addComponent(ccLocal().Label),
            setOnNode: (_n, c) => { c.string = "hello"; },
            currentValue: () => "hello",
            setSample: () => "world",
            expectAfterSet: (_n, c, v) => expect(c.string).toBe(v),
            componentBacked: true,
        },
        {
            name: "LabelFontSize",
            propType: EnumPropName.LabelFontSize,
            attach: (n) => n.addComponent(ccLocal().Label),
            setOnNode: (_n, c) => { c.fontSize = 24; },
            currentValue: () => 24,
            setSample: () => 36,
            expectAfterSet: (_n, c, v) => expect(c.fontSize).toBe(v),
            componentBacked: true,
        },
        {
            name: "LabelLineHeight",
            propType: EnumPropName.LabelLineHeight,
            attach: (n) => n.addComponent(ccLocal().Label),
            setOnNode: (_n, c) => { c.lineHeight = 30; },
            currentValue: () => 30,
            setSample: () => 40,
            expectAfterSet: (_n, c, v) => expect(c.lineHeight).toBe(v),
            componentBacked: true,
        },
        {
            name: "LabelSpacingX",
            propType: EnumPropName.LabelSpacingX,
            attach: (n) => n.addComponent(ccLocal().Label),
            setOnNode: (_n, c) => { c.spacingX = 2; },
            currentValue: () => 2,
            setSample: () => 5,
            expectAfterSet: (_n, c, v) => expect(c.spacingX).toBe(v),
            componentBacked: true,
        },
        {
            name: "LabelWrapEnable",
            propType: EnumPropName.LabelWrapEnable,
            attach: (n) => n.addComponent(ccLocal().Label),
            setOnNode: (_n, c) => { c.enableWrapText = true; },
            currentValue: () => true,
            setSample: () => false,
            expectAfterSet: (_n, c, v) => expect(c.enableWrapText).toBe(v),
            componentBacked: true,
        },
        {
            name: "Font",
            propType: EnumPropName.Font,
            attach: (n) => n.addComponent(ccLocal().Label),
            setOnNode: () => { /* font 默认 null, 不预设 */ },
            currentValue: () => null,
            setSample: () => null, // 用 null 验证赋值
            expectAfterSet: (_n, c, v) => expect(c.font).toBe(v),
            componentBacked: true,
        },

        // ---- LabelOutline ----
        {
            name: "LabelOutlineColor",
            propType: EnumPropName.LabelOutlineColor,
            attach: (n) => n.addComponent(ccLocal().LabelOutline),
            setOnNode: (_n, c) => { c.color = ccLocal().color(10, 20, 30, 255); },
            currentValue: () => ({ r: 10, g: 20, b: 30 }),
            setSample: () => ccLocal().color(50, 60, 70, 200),
            expectAfterSet: (_n, c) => expectColorLike(c.color, { r: 50, g: 60, b: 70 }),
            componentBacked: true,
        },

        // ---- Sprite ----
        {
            name: "SpriteFrame",
            propType: EnumPropName.SpriteFrame,
            attach: (n) => n.addComponent(ccLocal().Sprite),
            setOnNode: () => { /* spriteFrame 初始 null, 用 null 作 current */ },
            currentValue: () => null,
            setSample: () => null,
            expectAfterSet: (_n, c, v) => expect(c.spriteFrame).toBe(v),
            componentBacked: true,
        },
        {
            name: "SpriteFillRange",
            propType: EnumPropName.SpriteFillRange,
            attach: (n) => n.addComponent(ccLocal().Sprite),
            setOnNode: (_n, c) => { c.fillRange = 0.5; },
            currentValue: () => 0.5,
            setSample: () => 0.8,
            expectAfterSet: (_n, c, v) => expect(c.fillRange).toBe(v),
            componentBacked: true,
        },

        // ---- Slider / EditBox / Button / ProgressBar / Toggle / RichText / ScrollView / Mask ----
        {
            name: "SliderProgress",
            propType: EnumPropName.SliderProgress,
            attach: (n) => n.addComponent(ccLocal().Slider),
            setOnNode: (_n, c) => { c.progress = 0.3; },
            currentValue: () => 0.3,
            setSample: () => 0.7,
            expectAfterSet: (_n, c, v) => expect(c.progress).toBe(v),
            componentBacked: true,
        },
        {
            name: "EditboxString",
            propType: EnumPropName.EditboxString,
            attach: (n) => n.addComponent(ccLocal().EditBox),
            setOnNode: (_n, c) => { c.string = "initial"; },
            currentValue: () => "initial",
            setSample: () => "changed",
            expectAfterSet: (_n, c, v) => expect(c.string).toBe(v),
            componentBacked: true,
        },
        {
            name: "ButtonInteractable",
            propType: EnumPropName.ButtonInteractable,
            attach: (n) => n.addComponent(ccLocal().Button),
            setOnNode: (_n, c) => { c.interactable = false; },
            currentValue: () => false,
            setSample: () => true,
            expectAfterSet: (_n, c, v) => expect(c.interactable).toBe(v),
            componentBacked: true,
        },
        {
            name: "ProgressBarProgress",
            propType: EnumPropName.ProgressBarProgress,
            attach: (n) => n.addComponent(ccLocal().ProgressBar),
            setOnNode: (_n, c) => { c.progress = 0.4; },
            currentValue: () => 0.4,
            setSample: () => 0.9,
            expectAfterSet: (_n, c, v) => expect(c.progress).toBe(v),
            componentBacked: true,
        },
        {
            name: "ToggleIsChecked",
            propType: EnumPropName.ToggleIsChecked,
            attach: (n) => n.addComponent(ccLocal().Toggle),
            setOnNode: (_n, c) => { c.isChecked = true; },
            currentValue: () => true,
            setSample: () => false,
            expectAfterSet: (_n, c, v) => expect(c.isChecked).toBe(v),
            componentBacked: true,
        },
        {
            name: "RichTextString",
            propType: EnumPropName.RichTextString,
            attach: (n) => n.addComponent(ccLocal().RichText),
            setOnNode: (_n, c) => { c.string = "hi"; },
            currentValue: () => "hi",
            setSample: () => "rich",
            expectAfterSet: (_n, c, v) => expect(c.string).toBe(v),
            componentBacked: true,
        },
        {
            name: "ScrollViewEnabled",
            propType: EnumPropName.ScrollViewEnabled,
            attach: (n) => n.addComponent(ccLocal().ScrollView),
            setOnNode: (_n, c) => { c.enabled = true; },
            currentValue: () => true,
            setSample: () => false,
            expectAfterSet: (_n, c, v) => expect(c.enabled).toBe(v),
            componentBacked: true,
        },
        {
            name: "MaskEnabled",
            propType: EnumPropName.MaskEnabled,
            attach: (n) => n.addComponent(ccLocal().Mask),
            setOnNode: (_n, c) => { c.enabled = true; },
            currentValue: () => true,
            setSample: () => false,
            expectAfterSet: (_n, c, v) => expect(c.enabled).toBe(v),
            componentBacked: true,
        },

        // ---- Widget ----
        ...[
            { en: "WidgetEnabled", k: EnumPropName.WidgetEnabled, field: "enabled", cur: true, sample: false },
            { en: "WidgetAlignMode", k: EnumPropName.WidgetAlignMode, field: "alignMode", cur: 0, sample: 1 },
            { en: "WidgetIsAlignTop", k: EnumPropName.WidgetIsAlignTop, field: "isAlignTop", cur: false, sample: true },
            { en: "WidgetIsAlignBottom", k: EnumPropName.WidgetIsAlignBottom, field: "isAlignBottom", cur: false, sample: true },
            { en: "WidgetIsAlignLeft", k: EnumPropName.WidgetIsAlignLeft, field: "isAlignLeft", cur: false, sample: true },
            { en: "WidgetIsAlignRight", k: EnumPropName.WidgetIsAlignRight, field: "isAlignRight", cur: false, sample: true },
            { en: "WidgetIsAlignHorizontalCenter", k: EnumPropName.WidgetIsAlignHorizontalCenter, field: "isAlignHorizontalCenter", cur: false, sample: true },
            { en: "WidgetIsAlignVerticalCenter", k: EnumPropName.WidgetIsAlignVerticalCenter, field: "isAlignVerticalCenter", cur: false, sample: true },
            { en: "WidgetTop", k: EnumPropName.WidgetTop, field: "top", cur: 5, sample: 15 },
            { en: "WidgetBottom", k: EnumPropName.WidgetBottom, field: "bottom", cur: 6, sample: 16 },
            { en: "WidgetLeft", k: EnumPropName.WidgetLeft, field: "left", cur: 7, sample: 17 },
            { en: "WidgetRight", k: EnumPropName.WidgetRight, field: "right", cur: 8, sample: 18 },
            { en: "WidgetHorizontalCenter", k: EnumPropName.WidgetHorizontalCenter, field: "horizontalCenter", cur: 9, sample: 19 },
            { en: "WidgetVerticalCenter", k: EnumPropName.WidgetVerticalCenter, field: "verticalCenter", cur: 10, sample: 20 },
        ].map((w): PropSpec => ({
            name: w.en,
            propType: w.k,
            attach: (n) => n.addComponent(ccLocal().Widget),
            setOnNode: (_n, c) => { (c as any)[w.field] = w.cur; },
            currentValue: () => w.cur,
            setSample: () => w.sample,
            expectAfterSet: (_n, c, v) => expect((c as any)[w.field]).toBe(v),
            componentBacked: true,
        })),
    ];
    return list;
})();

describe("PropHandler registration coverage", () => {
    it.each(SPECS.map((s) => [s.name, s.propType] as const))(
        "%s is registered",
        (_name, propType) => {
            const h = PropHandlerManager.getHandler(propType);
            expect(h).toBeDefined();
            expect(typeof h.getValue).toBe("function");
            expect(typeof h.setValue).toBe("function");
            expect(typeof h.getDefaultValue).toBe("function");
        }
    );
});

describe.each(SPECS)("PropHandler contract: $name", (spec) => {
    it("getValue 读取当前节点 / 组件值", () => {
        const node = makeNode();
        const comp = spec.attach(node);
        spec.setOnNode(node, comp);

        const got = PropHandlerManager.getValue(spec.propType, node);
        const expected = spec.currentValue();

        // 复合类型用 close-to, 简单类型直接 ===
        if (expected !== null && typeof expected === "object") {
            if ("x" in expected && "y" in expected && "z" in expected) {
                expectVec3Like(got, expected as any);
            }
            else if ("x" in expected && "y" in expected) {
                expectVec2Like(got, expected as any);
            }
            else if ("r" in expected && "g" in expected) {
                expectColorLike(got, expected as any);
            }
            else if ("width" in expected && "height" in expected) {
                expectSizeLike(got, expected as any);
            }
            else {
                expect(got).toEqual(expected);
            }
        }
        else {
            expect(got).toBe(expected);
        }
    });

    it("setValue 写入节点 / 组件", () => {
        const node = makeNode();
        const comp = spec.attach(node);
        spec.setOnNode(node, comp); // 预设 current

        const sample = spec.setSample();
        PropHandlerManager.setValue(spec.propType, node, sample);

        spec.expectAfterSet(node, comp, sample);
    });

    it("getDefaultValue 返回当前节点 / 组件值 (同 getValue)", () => {
        const node = makeNode();
        const comp = spec.attach(node);
        spec.setOnNode(node, comp);

        const got = PropHandlerManager.getDefaultValue(spec.propType, node);
        const fromGet = PropHandlerManager.getValue(spec.propType, node);

        // 复合类型用 toEqual, 简单类型 toBe
        if (got !== null && typeof got === "object") {
            // 容忍 cc 复合类型多余字段
            for (const key of Object.keys(fromGet as any)) {
                if (typeof (fromGet as any)[key] === "number") {
                    expect((got as any)[key]).toBeCloseTo((fromGet as any)[key]);
                }
            }
        }
        else {
            expect(got).toBe(fromGet);
        }
    });

    it("null node 不应抛", () => {
        expect(() => PropHandlerManager.getValue(spec.propType, null as any)).not.toThrow();
        expect(() => PropHandlerManager.setValue(spec.propType, null as any, spec.setSample())).not.toThrow();
        expect(() => PropHandlerManager.getDefaultValue(spec.propType, null as any)).not.toThrow();
    });

    if (true) {
        it("getValue(nullNode) 返回 undefined", () => {
            expect(PropHandlerManager.getValue(spec.propType, null as any)).toBeUndefined();
        });
    }

    if (true) {
        // 仅对组件依赖的 prop 测试 "缺组件 -> undefined"
        if (spec.componentBacked) {
            it("缺所需组件时 getValue 返回 undefined", () => {
                const node = makeNode(); // 不 attach 组件
                const got = PropHandlerManager.getValue(spec.propType, node);
                expect(got).toBeUndefined();
            });

            it("缺所需组件时 setValue 不抛", () => {
                const node = makeNode();
                expect(() => PropHandlerManager.setValue(spec.propType, node, spec.setSample())).not.toThrow();
            });
        }
    }
});

describe("PropHandler manager edge cases", () => {
    it("getHandler(未注册) 返回 undefined", () => {
        expect(PropHandlerManager.getHandler(99999)).toBeUndefined();
    });

    it("getValue(未注册 propType) 返回 undefined 不抛", () => {
        const node = makeNode();
        expect(() => {
            const got = PropHandlerManager.getValue(99999, node);
            expect(got).toBeUndefined();
        }).not.toThrow();
    });

    it("setValue(未注册 propType) 不抛", () => {
        const node = makeNode();
        expect(() => PropHandlerManager.setValue(99999, node, "anything")).not.toThrow();
    });
});
