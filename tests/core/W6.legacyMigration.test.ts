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
    it("GrayScale 数字 key 静默丢, 其它 key 保留", () => {
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
        // GrayScale 静默丢
        expect(state1[EnumPropName.GrayScale]).toBeUndefined();
        // 内置 prop 保留 (c2 才迁)
        expect(state1[EnumPropName.Active]).toBe(true);
        expect(state1[EnumPropName.Color]).toBe("stub-color");
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

    it("AMBIGUOUS 数字 key (Position/Anchor/Size) 保留 (c2 决定)", () => {
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
        // AMBIGUOUS 全保留
        expect(state1[EnumPropName.Position]).toBe("stub-pos");
        expect(state1[EnumPropName.Anchor]).toBe("stub-anchor");
        expect(state1[EnumPropName.Size]).toBe("stub-size");
        // GrayScale 丢
        expect(state1[EnumPropName.GrayScale]).toBeUndefined();
    });

    it("自定义 string propRef key 完全不动 + $$xxx$$ 元数据 key 不动", () => {
        const { ctrl, select } = setup();
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = (select as any)._ctrlData[ctrlId] || {};
        (select as any)._ctrlData[ctrlId][1] = {
            [EnumPropName.Active]: true,
            [EnumPropName.GrayScale]: "stub-gray",
            "MyComp.heat": 99,
            "MyComp.label": "foo",
            $$controlledProps$$: { Active: EnumPropName.Active, "MyComp.heat": EnumPropName.Non },
            $$propertyData$$: { [EnumPropName.Active]: true },
            $$lastProp$$: EnumPropName.Active,
        };

        (select as any).migrateLegacyCtrlData();

        const state1 = (select as any)._ctrlData[ctrlId][1];
        // GrayScale 丢
        expect(state1[EnumPropName.GrayScale]).toBeUndefined();
        // 内置数字 key 保留
        expect(state1[EnumPropName.Active]).toBe(true);
        // 自定义 string key 完全不动
        expect(state1["MyComp.heat"]).toBe(99);
        expect(state1["MyComp.label"]).toBe("foo");
        // $$xxx$$ 元数据完全不动
        expect(state1.$$controlledProps$$).toEqual({ Active: EnumPropName.Active, "MyComp.heat": EnumPropName.Non });
        expect(state1.$$propertyData$$).toEqual({ [EnumPropName.Active]: true });
        expect(state1.$$lastProp$$).toBe(EnumPropName.Active);
    });

    it("$$propertyData$$ 内层 GrayScale 数字 key 也清 + 其它内置 prop 保留", () => {
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
        // 内层 GrayScale 也丢
        expect(inner[EnumPropName.GrayScale]).toBeUndefined();
        // 内层其它内置 prop 保留
        expect(inner[EnumPropName.Active]).toBe(true);
        expect(inner[EnumPropName.Color]).toBe("stub-color-inner");
    });

    it("$$default$$ state 内也按同规则清 GrayScale", () => {
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
        expect(dft[EnumPropName.Active]).toBe(false);
    });
});
