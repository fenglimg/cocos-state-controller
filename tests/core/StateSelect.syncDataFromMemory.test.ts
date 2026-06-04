/**
 * StateSelectV2.syncDataFromMemory 契约测试 (Phase 3.7 前置)
 *
 * syncDataFromMemory 是 inspector 上 "📥 从内存同步数据" 按钮的处理函数,
 * 用于在数据 / 显示状态走样时手动恢复。要求保留的核心行为:
 *   1. 不抛 (空 propData / 缺元数据 都得能跑)
 *   2. $$controlledProps$$ 从 $$changedProp$$ 重建 (兼容历史不同步数据)
 *   3. $$lastProp$$ 存在时恢复 _propKey / _propValue / _currentDisplayProp
 *   4. 调用 forceRefreshInspector 一次刷新检查器
 *
 * 可以丢的行为 (会在简化中删除):
 *   - 反向 migration: 把 legacy 数字 key 搬到 $$propertyData$$ (方向跟项目策略相反)
 *   - 第二轮 setTimeout(100) 延迟刷新 (调用第一遍刷新就足够了)
 *   - 大量 Editor.log / StateErrorManagerV2.debug 日志噪音
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
const ControllerMod = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelectV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnumV2");

const { StateControllerV2 } = ControllerMod;
const { StateSelectV2 } = SelectMod;
const { EnumPropName } = EnumMod;

function setup() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();

    (ctrl as any).markCacheDirty();

    return { ctrl, select, selectNode };
}

describe("syncDataFromMemory contract", () => {
    it("空 propData 路径不抛", () => {
        const { select } = setup();
        expect(() => select.syncDataFromMemory()).not.toThrow();
    });

    it("从 $$changedProp$$ 重建缺失的 $$controlledProps$$", () => {
        const { ctrl, select } = setup();

        // 模拟数据走样: 只有 $$changedProp$$, $$controlledProps$$ 缺失
        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = {
            [ctrl.selectedIndex]: {
                $$changedProp$$: { Active: EnumPropName.Active },
            },
        };

        select.syncDataFromMemory();

        const propData = (select as any).getPropData();
        expect(propData.$$controlledProps$$).toBeDefined();
        expect(propData.$$controlledProps$$.Active).toBe(EnumPropName.Active);
    });

    it("$$lastProp$$ 存在时恢复 _propKey / _currentDisplayProp", () => {
        const { ctrl, select } = setup();

        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = {
            [ctrl.selectedIndex]: {
                [EnumPropName.Active]: true,
                $$lastProp$$: EnumPropName.Active,
                $$controlledProps$$: { Active: EnumPropName.Active },
            },
        };

        select.syncDataFromMemory();

        expect((select as any)._propKey).toBe(EnumPropName.Active);
        expect((select as any)._currentDisplayProp).toBe(EnumPropName.Active);
    });

    it("$$lastProp$$ 不存在时 _currentDisplayProp 应清空为 Non", () => {
        const { ctrl, select } = setup();

        const ctrlId = ctrl.ctrlId;
        (select as any)._ctrlData[ctrlId] = {
            [ctrl.selectedIndex]: {},
        };
        (select as any)._currentDisplayProp = EnumPropName.Active; // 残留态

        select.syncDataFromMemory();

        expect((select as any)._currentDisplayProp).toBe(EnumPropName.Non);
    });

    it("非 CC_EDITOR 环境直接返回 (不抛, 不动状态)", () => {
        const { select } = setup();
        (globalThis as any).CC_EDITOR = false;

        const before = (select as any)._currentDisplayProp;
        select.syncDataFromMemory();
        expect((select as any)._currentDisplayProp).toBe(before);

        (globalThis as any).CC_EDITOR = true; // 恢复
    });
});
