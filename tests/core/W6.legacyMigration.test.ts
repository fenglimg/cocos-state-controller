/**
 * W6-2c1 ctrlData migration framework 测试 (极简范围).
 *
 * 验证 framework 锚点:
 *   1) LEGACY_DROPPED_ENUMS (EnumPropRefMap export) 含 GrayScale=15
 *   2) StateSelect.migrateLegacyCtrlData 私有方法:
 *      - 仅删 LEGACY_DROPPED_ENUMS 中数字 key (即 GrayScale)
 *      - ENUM_TO_PROPREF 内置 prop 数字 key (Active=1, Color=10, LabelString=3, ...) 保留 (c2 才迁)
 *      - AMBIGUOUS 数字 key (Position=2, Anchor=8, Size=9) 保留 (c2 决定)
 *      - 自定义 string propRef key 完全不动
 *      - $$xxx$$ 元数据 key 完全不动 ($$controlledProps$$ / $$propertyData$$ / $$lastProp$$ / $$changedProp$$)
 *      - idempotent (重跑形状不变)
 *      - $$propertyData$$ 内层也清 GrayScale 数字 key
 *   3) __preload 早期调用一次 (在 nodeProps.owner 初始化之前)
 *
 * 真 cocos 引擎集成测试模式, 参考 tests/core/W6.customComponent.test.ts.
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
const ControllerMod = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelect");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnum");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumPropRefMapMod = require("../../assets/script/controller/EnumPropRefMap");

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;

function setup() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();

    (ctrl as any).markCacheDirty();
    return { root, ctrl, select, selectNode };
}

describe("W6-2c1 LEGACY_DROPPED_ENUMS export (framework 锚点)", () => {
    it("EnumPropRefMap 导出 LEGACY_DROPPED_ENUMS", () => {
        expect(Array.isArray(EnumPropRefMapMod.LEGACY_DROPPED_ENUMS)).toBe(true);
    });

    it("LEGACY_DROPPED_ENUMS 含 GrayScale", () => {
        expect(EnumPropRefMapMod.LEGACY_DROPPED_ENUMS).toContain(EnumPropName.GrayScale);
        // GrayScale = 15
        expect(EnumPropRefMapMod.LEGACY_DROPPED_ENUMS).toContain(15);
    });
});

describe("W6-2c1 migrateLegacyCtrlData 私有方法 (极简实装)", () => {
    it("W6-2c2: GrayScale 数字 key 静默丢, 内置 prop number key 迁 string", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;

        // 注入一个 fixture state, 含 GrayScale=15 + Active=1
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId][1] = {
            [EnumPropName.GrayScale]: "stub-gray",
            [EnumPropName.Active]: true,
            [EnumPropName.Color]: "stub-color",
        };

        (select as any).migrateLegacyCtrlData();

        const state1 = (select as any)._ctrlData[ctrlId][1];
        // GrayScale 静默丢 (W6-2c1)
        expect(state1[EnumPropName.GrayScale]).toBeUndefined();
        // W6-2c2: 内置 prop 迁 string propRef key, 数字 key 清
        expect(state1[EnumPropName.Active]).toBeUndefined();
        expect(state1[EnumPropName.Color]).toBeUndefined();
        expect(state1["cc.Node.active"]).toBe(true);
        expect(state1["cc.Node.color"]).toBe("stub-color");
    });

    it("idempotent: 重复调形状不变", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId][1] = {
            [EnumPropName.Active]: true,
            [EnumPropName.Color]: 0xff00ff,
        };

        (select as any).migrateLegacyCtrlData();
        const snapshot1 = JSON.stringify((select as any)._ctrlData[ctrlId][1]);

        (select as any).migrateLegacyCtrlData();
        const snapshot2 = JSON.stringify((select as any)._ctrlData[ctrlId][1]);
        // 幂等: 重跑 no-op
        expect(snapshot2).toBe(snapshot1);

        (select as any).migrateLegacyCtrlData();
        const snapshot3 = JSON.stringify((select as any)._ctrlData[ctrlId][1]);
        expect(snapshot3).toBe(snapshot1);
    });

    it("W6-2c2: AMBIGUOUS 数字 key (Position/Anchor/Size) 迁 string propRef key", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId][1] = {
            [EnumPropName.Position]: "stub-pos",
            [EnumPropName.Anchor]: "stub-anchor",
            [EnumPropName.Size]: "stub-size",
            [EnumPropName.GrayScale]: "stub-gray",
        };

        (select as any).migrateLegacyCtrlData();

        const state1 = (select as any)._ctrlData[ctrlId][1];
        // W6-2c2: AMBIGUOUS 数字 key 迁 string propRef key (整体存)
        expect(state1[EnumPropName.Position]).toBeUndefined();
        expect(state1[EnumPropName.Anchor]).toBeUndefined();
        expect(state1[EnumPropName.Size]).toBeUndefined();
        expect(state1["cc.Node.position"]).toBe("stub-pos");
        expect(state1["cc.Node.anchorPoint"]).toBe("stub-anchor");
        expect(state1["cc.Node.contentSize"]).toBe("stub-size");
        // GrayScale 丢 (W6-2c1)
        expect(state1[EnumPropName.GrayScale]).toBeUndefined();
    });

    it("W6-2c2: 自定义 string propRef key 完全不动 + $$xxx$$ 元数据 key 不动 + 内置 prop 迁 string", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId][1] = {
            [EnumPropName.Active]: true,
            [EnumPropName.GrayScale]: "stub-gray",
            "MyComp.heat": 99,
            "MyComp.label": "foo",
            $$controlledProps$$: { Active: EnumPropName.Active, "MyComp.heat": EnumPropName.Non },
            $$lastProp$$: EnumPropName.Active,
        };

        (select as any).migrateLegacyCtrlData();

        const state1 = (select as any)._ctrlData[ctrlId][1];
        // GrayScale 丢
        expect(state1[EnumPropName.GrayScale]).toBeUndefined();
        // W6-2c2: 内置 prop 迁 string
        expect(state1[EnumPropName.Active]).toBeUndefined();
        expect(state1["cc.Node.active"]).toBe(true);
        // 自定义 string key 完全不动
        expect(state1["MyComp.heat"]).toBe(99);
        expect(state1["MyComp.label"]).toBe("foo");
        // $$xxx$$ 元数据 key 完全不动 ($$controlledProps$$ 内层 value 是 EnumPropName 数字, 是合法语义)
        expect(state1.$$controlledProps$$).toEqual({ Active: EnumPropName.Active, "MyComp.heat": EnumPropName.Non });
        expect(state1.$$lastProp$$).toBe(EnumPropName.Active);
    });

    it("W6-2c2: $$propertyData$$ 内层 GrayScale 清 + 其它内置 prop 迁 string", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId][1] = {
            $$propertyData$$: {
                [EnumPropName.GrayScale]: "stub-gray-inner",
                [EnumPropName.Active]: true,
                [EnumPropName.Color]: "stub-color-inner",
            },
        };

        (select as any).migrateLegacyCtrlData();

        const inner = (select as any)._ctrlData[ctrlId][1].$$propertyData$$;
        // 内层 GrayScale 也丢 (W6-2c1)
        expect(inner[EnumPropName.GrayScale]).toBeUndefined();
        // W6-2c2: 内层其它内置 prop 迁 string
        expect(inner[EnumPropName.Active]).toBeUndefined();
        expect(inner[EnumPropName.Color]).toBeUndefined();
        expect(inner["cc.Node.active"]).toBe(true);
        expect(inner["cc.Node.color"]).toBe("stub-color-inner");
    });

    it("W6-2c2: $$default$$ state 内 GrayScale 清 + 内置 prop 迁 string", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId].$$default$$ = {
            [EnumPropName.GrayScale]: "stub-gray-default",
            [EnumPropName.Active]: false,
        };

        (select as any).migrateLegacyCtrlData();

        const dft = (select as any)._ctrlData[ctrlId].$$default$$;
        expect(dft[EnumPropName.GrayScale]).toBeUndefined();
        // W6-2c2: Active 迁 string propRef
        expect(dft[EnumPropName.Active]).toBeUndefined();
        expect(dft["cc.Node.active"]).toBe(false);
    });
});

describe("W6-2c2 migrateLegacyCtrlData: ENUM_TO_PROPREF 36 项 number→string 迁移", () => {
    it("内置 prop (Active/Color/Opacity/Euler/Scale) 数字 key 迁 string propRef key", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId][1] = {
            [EnumPropName.Active]: true,
            [EnumPropName.Color]: "stub-color",
            [EnumPropName.Opacity]: 128,
            [EnumPropName.Euler]: "stub-euler",
            [EnumPropName.Scale]: 2,
        };

        (select as any).migrateLegacyCtrlData();

        const state1 = (select as any)._ctrlData[ctrlId][1];
        // 数字 key 全删
        expect(state1[EnumPropName.Active]).toBeUndefined();
        expect(state1[EnumPropName.Color]).toBeUndefined();
        expect(state1[EnumPropName.Opacity]).toBeUndefined();
        expect(state1[EnumPropName.Euler]).toBeUndefined();
        expect(state1[EnumPropName.Scale]).toBeUndefined();
        // string propRef key 全写入
        expect(state1["cc.Node.active"]).toBe(true);
        expect(state1["cc.Node.color"]).toBe("stub-color");
        expect(state1["cc.Node.opacity"]).toBe(128);
        expect(state1["cc.Node.eulerAngles"]).toBe("stub-euler");
        expect(state1["cc.Node.scale"]).toBe(2);
    });

    it("组件 prop (LabelString/WidgetTop/SpriteFrame) 数字 key 迁 string propRef key", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId][1] = {
            [EnumPropName.LabelString]: "hello",
            [EnumPropName.WidgetTop]: 10,
            [EnumPropName.SpriteFrame]: "stub-frame",
        };

        (select as any).migrateLegacyCtrlData();

        const state1 = (select as any)._ctrlData[ctrlId][1];
        expect(state1[EnumPropName.LabelString]).toBeUndefined();
        expect(state1[EnumPropName.WidgetTop]).toBeUndefined();
        expect(state1[EnumPropName.SpriteFrame]).toBeUndefined();
        expect(state1["cc.Label.string"]).toBe("hello");
        expect(state1["cc.Widget.top"]).toBe(10);
        expect(state1["cc.Sprite.spriteFrame"]).toBe("stub-frame");
    });

    it("$$propertyData$$ 内层 number key 也按 ENUM_TO_PROPREF 迁 string + 内层 GrayScale 仍清", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId][1] = {
            $$propertyData$$: {
                [EnumPropName.GrayScale]: "stub-gray-inner",
                [EnumPropName.Active]: true,
                [EnumPropName.Color]: "stub-color-inner",
                [EnumPropName.Position]: "stub-pos-inner",
            },
        };

        (select as any).migrateLegacyCtrlData();

        const inner = (select as any)._ctrlData[ctrlId][1].$$propertyData$$;
        expect(inner[EnumPropName.GrayScale]).toBeUndefined();
        expect(inner[EnumPropName.Active]).toBeUndefined();
        expect(inner[EnumPropName.Color]).toBeUndefined();
        expect(inner[EnumPropName.Position]).toBeUndefined();
        expect(inner["cc.Node.active"]).toBe(true);
        expect(inner["cc.Node.color"]).toBe("stub-color-inner");
        expect(inner["cc.Node.position"]).toBe("stub-pos-inner");
    });

    it("idempotent: 第二次扫已无数字 key, no-op", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId][1] = {
            [EnumPropName.Active]: true,
            [EnumPropName.Position]: "stub-pos",
        };

        (select as any).migrateLegacyCtrlData();
        const snap1 = JSON.stringify((select as any)._ctrlData[ctrlId][1]);
        (select as any).migrateLegacyCtrlData();
        const snap2 = JSON.stringify((select as any)._ctrlData[ctrlId][1]);
        expect(snap2).toBe(snap1);
    });

    it("自定义 string propRef key 和 $$xxx$$ 元数据 key 完全不动", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId][1] = {
            [EnumPropName.Active]: true,
            "MyComp.heat": 99,
            $$controlledProps$$: { Active: EnumPropName.Active, "MyComp.heat": EnumPropName.Non },
            $$lastProp$$: EnumPropName.Active,
        };

        (select as any).migrateLegacyCtrlData();

        const state1 = (select as any)._ctrlData[ctrlId][1];
        expect(state1["MyComp.heat"]).toBe(99);
        expect(state1.$$controlledProps$$).toEqual({ Active: EnumPropName.Active, "MyComp.heat": EnumPropName.Non });
        expect(state1.$$lastProp$$).toBe(EnumPropName.Active);
        // 内置 prop 已迁
        expect(state1[EnumPropName.Active]).toBeUndefined();
        expect(state1["cc.Node.active"]).toBe(true);
    });
});

describe("W6-2c2 production 写路径: togglePropertyControl 写 string propRef key", () => {
    it("togglePropertyControl(EnumPropName.Active, true) → propData 内层 key 是 string 不是数字", () => {
        const { select } = setup();
        // TASK-003: __preload 自动接入 Opacity, 先 opt-out 让范围干净
        select.togglePropertyControl(EnumPropName.Opacity, false);

        select.togglePropertyControl(EnumPropName.Active, true);

        const propData = (select as any).getPropData();
        // W6-2c2: 写 string key, 不写数字 key
        expect(propData["cc.Node.active"]).not.toBeUndefined();
        expect(propData[EnumPropName.Active]).toBeUndefined();
        // $$controlledProps$$ 仍按 EnumPropName name 写 ("Active" → propType 数字), 与历史一致
        expect(propData.$$controlledProps$$.Active).toBe(EnumPropName.Active);
    });

    it("togglePropertyControl(EnumPropName.Color, true) → 内置 prop 也走 string key", () => {
        const { select } = setup();
        select.togglePropertyControl(EnumPropName.Opacity, false);

        select.togglePropertyControl(EnumPropName.Color, true);

        const propData = (select as any).getPropData();
        expect(propData["cc.Node.color"]).not.toBeUndefined();
        expect(propData[EnumPropName.Color]).toBeUndefined();
    });
});
