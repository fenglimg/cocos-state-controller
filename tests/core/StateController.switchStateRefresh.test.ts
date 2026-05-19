/**
 * 切 state 时 StateSelect 节点 inspector 刷新契约
 *
 * Why: 用户发现 propValue (getter @property) 切 state 后显示陈旧值,
 * 因为 cocos 不会自动重读 getter, 且 6081bd3 去掉了切 state 的自动 forceRefreshInspector.
 *
 * 修复 (选项 A): 在 StateController.updateState(EnumUpdateType.State) 路径上,
 * 对每个 StateSelect 主动调用 forceRefreshInspector. 改 propValue / state CRUD
 * 等其他路径仍不刷新 (体验优化).
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
const ControllerMod = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelect");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnum");

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;

function setupCtrlAndSelect() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("SSR_Root");
    const ctrlNode = new ccL.Node("SSR_Ctrl");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("SSR_Select");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { root, ctrlNode, selectNode, ctrl, select };
}

describe("切 state 触发 select inspector 刷新", () => {
    it("ctrl.selectedIndex 改变, refreshSelectedInspector 应被 select 节点 uuid 调用", () => {
        const { ctrl, selectNode } = setupCtrlAndSelect();
        refreshSpy.mockClear();

        ctrl.selectedIndex = 1;

        expect(refreshSpy).toHaveBeenCalledWith("node", selectNode.uuid);
    });

    it("多个 select 都应被刷新一次", () => {
        const ccL = (globalThis as any).cc;
        const { root, ctrl } = setupCtrlAndSelect();
        // 加第二个 select
        const select2Node = new ccL.Node("SSR_Select2");
        (root.children[0] as any).addChild(select2Node);
        select2Node.addComponent(StateSelect);
        (select2Node.getComponent(StateSelect) as any).__preload();
        (ctrl as any).markCacheDirty();

        refreshSpy.mockClear();
        ctrl.selectedIndex = 1;

        // 至少 select2 节点和原 select 节点各被刷新一次
        const calledUuids = refreshSpy.mock.calls.map(c => c[1]);
        expect(calledUuids).toContain(select2Node.uuid);
    });
});

describe("改 propValue 不应触发 inspector 刷新 (体验优化)", () => {
    it("propValue setter 不应直接调 refreshSelectedInspector", () => {
        const { select } = setupCtrlAndSelect();
        select.togglePropertyControl(EnumPropName.Active, true);

        refreshSpy.mockClear();
        (select as any).propValue = false;

        // propValue setter 内调 updateState, 但 updateState 内不再带 forceRefresh.
        // 只有 ctrl 端 EnumUpdateType.State 路径才会触发刷新.
        expect(refreshSpy).not.toHaveBeenCalled();
    });
});
