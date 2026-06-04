/**
 * 切 state 时 StateSelectV2 节点 inspector **不应** 自动刷新 (契约锁定)
 *
 * Why: cocos `Editor.Utils.refreshSelectedInspector` 是全量重建 inspector dom,
 * 自动调用会让用户切 state / 改 prop 时丢焦点 / 抖动 / 滚动跳动. 实测体验差.
 * 跟 werewolf 项目默认 ManualRefresh 模式一致: propValue 等 getter @property
 * 显示陈旧由用户主动按 "刷新检查器" 按钮 (manualRefreshTrigger) 解决.
 *
 * 历史回顾:
 *   - 6081bd3 去掉 states setter + _emitSelectedPageChanged 的自动 refresh
 *   - 53b56ae 加回 EnumUpdateType.State 路径的 select refresh (修 propValue 陈旧)
 *     → 用户报抖动 → 回滚
 *   - 这里锁定: 任何"被动"路径 (切 state / 改 propValue / state CRUD) 都不应触发
 *     refresh, 只允许显式用户按钮触发.
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

let refreshSpy: jest.Mock;

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    refreshSpy = jest.fn();
    (globalThis as any).Editor = {
        log: () => {},
        warn: () => {},
        error: () => {},
        Utils: { refreshSelectedInspector: refreshSpy },
    };
});

beforeEach(() => {
    refreshSpy.mockClear();
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

function setupCtrlAndSelect() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("SSR_Root");
    const ctrlNode = new ccL.Node("SSR_Ctrl");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("SSR_Select");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { root, ctrlNode, selectNode, ctrl, select };
}

describe("被动路径都不应触发 inspector 刷新", () => {
    it("切 state (ctrl.selectedIndex 改变) 不应触发 refreshSelectedInspector", () => {
        const { ctrl } = setupCtrlAndSelect();
        refreshSpy.mockClear();

        ctrl.selectedIndex = 1;

        expect(refreshSpy).not.toHaveBeenCalled();
    });

    it("改 propValue 不应触发 refreshSelectedInspector", () => {
        const { select } = setupCtrlAndSelect();
        select.togglePropertyControl(EnumPropName.Active, true);

        refreshSpy.mockClear();
        (select as any).propValue = false;

        expect(refreshSpy).not.toHaveBeenCalled();
    });

    it("state CRUD (states 数组变化) 不应触发 refreshSelectedInspector", () => {
        const { ctrl } = setupCtrlAndSelect();
        refreshSpy.mockClear();

        // 追加一个 state
        const newStates = [...(ctrl as any)._states];
        const StateValueCls = ControllerMod.StateValue;
        newStates.push(StateValueCls.create("3", 99));
        ctrl.states = newStates;

        expect(refreshSpy).not.toHaveBeenCalled();
    });
});

describe("唯一允许的刷新入口: 用户主动按按钮", () => {
    it("select 上的 forceRefreshInspector() 显式调用触发刷新", () => {
        const { select, selectNode } = setupCtrlAndSelect();
        refreshSpy.mockClear();

        select.forceRefreshInspector();

        expect(refreshSpy).toHaveBeenCalledWith("node", selectNode.uuid);
    });
});
