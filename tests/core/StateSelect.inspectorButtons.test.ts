/**
 * StateSelectV2 Inspector 按钮契约 (Phase 4.5)
 *
 * 覆盖三个面向编辑器的 inspector 按钮:
 *   - forceRefreshInspector: 调用 Editor.Utils.refreshSelectedInspector
 *   - manualReloadController: 重置后重新拿到 currCtrlId
 *   - deletePropertyWithConfirmation: 没选 prop 静默 / 选了且 confirm=true 才真删
 *
 * syncDataFromMemory 已在 StateSelectV2.syncDataFromMemory.test.ts 覆盖.
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
    const root = new ccL.Node("IB_Root");
    const ctrlNode = new ccL.Node("IB_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("IB_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { root, ctrlNode, selectNode, ctrl, select };
}

describe("StateSelectV2.forceRefreshInspector", () => {
    it("调用一次 Editor.Utils.refreshSelectedInspector('node', node.uuid)", () => {
        const { select, selectNode } = setupCtrlAndSelect();
        refreshSpy.mockClear();

        select.forceRefreshInspector();

        expect(refreshSpy).toHaveBeenCalledTimes(1);
        expect(refreshSpy).toHaveBeenCalledWith("node", selectNode.uuid);
    });

    it("Editor.Utils.refreshSelectedInspector 抛错时不应传播", () => {
        const { select } = setupCtrlAndSelect();
        refreshSpy.mockImplementationOnce(() => { throw new Error("editor down"); });

        expect(() => select.forceRefreshInspector()).not.toThrow();
    });
});

describe("StateSelectV2.manualReloadController", () => {
    it("调用后 currCtrlId 应被重新分配为 parent controller 的 ctrlId", () => {
        const { ctrl, select } = setupCtrlAndSelect();
        const originalCtrlId = ctrl.ctrlId;
        expect(select.currCtrlId).toBe(originalCtrlId);

        // 人为清掉, 模拟 inspector 看见数据走样
        (select as any)._currCtrlId = null;

        select.manualReloadController();

        expect(select.currCtrlId).toBe(originalCtrlId);
    });
});

describe("StateSelectV2.deletePropertyWithConfirmation", () => {
    it("没选中任何 prop 时静默返回, 不抛错", () => {
        const { select } = setupCtrlAndSelect();
        // 默认 _propKey = Non, 走 "没选中" 分支
        expect(() => select.deletePropertyWithConfirmation()).not.toThrow();
    });

    it("选了 prop 且 confirm=true 时, propData 中该 prop 字段被清空", () => {
        const { select } = setupCtrlAndSelect();
        // 选中 Opacity 并启用控制
        select.togglePropertyControl(EnumPropName.Opacity, true);
        (select as any)._propKey = EnumPropName.Opacity;

        // mock window.confirm 返回 true
        const originalConfirm = (globalThis as any).confirm;
        (globalThis as any).confirm = jest.fn(() => true);
        // 抑制原本可能抛 "Not implemented" 的 Editor.Dialog
        const prevDialog = (globalThis as any).Editor.Dialog;
        (globalThis as any).Editor.Dialog = undefined;

        try {
            select.deletePropertyWithConfirmation();
            // 删除后 isPropertyControlled 应为 false
            expect(select.isPropertyControlled(EnumPropName.Opacity)).toBe(false);
        }
        finally {
            (globalThis as any).confirm = originalConfirm;
            (globalThis as any).Editor.Dialog = prevDialog;
        }
    });

    it("选了 prop 但 confirm=false 时, propData 不变", () => {
        const { select } = setupCtrlAndSelect();
        select.togglePropertyControl(EnumPropName.Active, true);
        (select as any)._propKey = EnumPropName.Active;

        const originalConfirm = (globalThis as any).confirm;
        (globalThis as any).confirm = jest.fn(() => false);
        const prevDialog = (globalThis as any).Editor.Dialog;
        (globalThis as any).Editor.Dialog = undefined;

        try {
            select.deletePropertyWithConfirmation();
            expect(select.isPropertyControlled(EnumPropName.Active)).toBe(true);
        }
        finally {
            (globalThis as any).confirm = originalConfirm;
            (globalThis as any).Editor.Dialog = prevDialog;
        }
    });
});
