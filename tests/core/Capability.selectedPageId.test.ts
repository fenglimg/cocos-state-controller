/**
 * SelectedPageIdCapability 接入契约 (Wave 3 T05-T06)
 *
 * 用稳定的 stateId (反序列化存储, 不跟 index/order 变) 来切换状态.
 * 解决 ctrl.selectedIndex 在 reorder/delete 后下标飘移的问题.
 *
 *   SelectedPageIdCapability.setStateById(ctrl, stateId) → 成功 true / 失败 false
 *   SelectedPageIdCapability.getSelectedStateId(ctrl) → 当前 state 的 stateId, -1 表示无效
 *   SelectedPageIdCapability.getStateIdByName(ctrl, name) → stateId, -1 表示不存在
 *
 * 不持久化新数据; 全部从 _states[].stateId 派生.
 *
 * 红预期: 模块不存在.
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
const { StateControllerV2 } = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelectV2 } = require("../../assets/script/controller/StateSelectV2");

function setupCtrl() {
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

    return { ctrl, select };
}

describe("SelectedPageIdCapability (Wave 3 T05)", () => {
    it("模块存在 + name = selectedPageId + 已注册", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/capabilities/SelectedPageIdCapability");
        expect(Mod.SelectedPageIdCapability).toBeDefined();
        expect(Mod.SelectedPageIdCapability.name).toBe("selectedPageId");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        expect(CapabilityRegistry.get("selectedPageId")).toBeDefined();
    });

    it("getSelectedStateId(ctrl) = 当前 _states[selectedIndex].stateId", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SelectedPageIdCapability } = require("../../assets/script/controller/capabilities/SelectedPageIdCapability");
        const { ctrl } = setupCtrl();
        ctrl.selectedIndex = 1;
        expect(SelectedPageIdCapability.getSelectedStateId(ctrl)).toBe(ctrl._states[1].stateId);
    });

    it("setStateById(ctrl, stateId) 成功切换, 返回 true", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SelectedPageIdCapability } = require("../../assets/script/controller/capabilities/SelectedPageIdCapability");
        const { ctrl } = setupCtrl();
        const target = ctrl._states[1];
        expect(ctrl.selectedIndex).toBe(0);
        const ok = SelectedPageIdCapability.setStateById(ctrl, target.stateId);
        expect(ok).toBe(true);
        expect(ctrl.selectedIndex).toBe(1);
        expect(SelectedPageIdCapability.getSelectedStateId(ctrl)).toBe(target.stateId);
    });

    it("setStateById 不存在的 stateId → 返回 false, 不动 selectedIndex", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SelectedPageIdCapability } = require("../../assets/script/controller/capabilities/SelectedPageIdCapability");
        const { ctrl } = setupCtrl();
        ctrl.selectedIndex = 1;
        const ok = SelectedPageIdCapability.setStateById(ctrl, 9999);
        expect(ok).toBe(false);
        expect(ctrl.selectedIndex).toBe(1);
    });

    it("reorder 后, getSelectedStateId 跟着原 state 走 (而不是停在 index)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SelectedPageIdCapability } = require("../../assets/script/controller/capabilities/SelectedPageIdCapability");
        const { ctrl } = setupCtrl();
        ctrl.selectedIndex = 1;
        const originalStateId = ctrl._states[1].stateId;
        const originalName = ctrl._states[1].name;

        // 把 state 顺序反过来
        ctrl.states = [ctrl._states[1], ctrl._states[0]];

        // 编辑器把 selectedIndex 修了 (states.setter 内部 applyIndex 调整)
        // 但 stateId 是稳定的, 我们用 setStateById 来再次切回原 state
        const ok = SelectedPageIdCapability.setStateById(ctrl, originalStateId);
        expect(ok).toBe(true);
        expect(ctrl._states[ctrl.selectedIndex].stateId).toBe(originalStateId);
        expect(ctrl._states[ctrl.selectedIndex].name).toBe(originalName);
    });

    it("getStateIdByName(ctrl, name) 返回对应 stateId", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SelectedPageIdCapability } = require("../../assets/script/controller/capabilities/SelectedPageIdCapability");
        const { ctrl } = setupCtrl();
        const expected = ctrl._states[1].stateId;
        expect(SelectedPageIdCapability.getStateIdByName(ctrl, ctrl._states[1].name)).toBe(expected);
        expect(SelectedPageIdCapability.getStateIdByName(ctrl, "nonexistent")).toBe(-1);
    });

    it("listAllStates(ctrl) 返回 [{stateId, name, index}] 数组 (Panel 用)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SelectedPageIdCapability } = require("../../assets/script/controller/capabilities/SelectedPageIdCapability");
        const { ctrl } = setupCtrl();
        const list = SelectedPageIdCapability.listAllStates(ctrl);
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBe(ctrl._states.length);
        for (let i = 0; i < list.length; i++) {
            expect(list[i].index).toBe(i);
            expect(list[i].stateId).toBe(ctrl._states[i].stateId);
            expect(list[i].name).toBe(ctrl._states[i].name);
        }
    });

    it("setStateById 触发 stateChanged 事件 (EventCapability 联动)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SelectedPageIdCapability } = require("../../assets/script/controller/capabilities/SelectedPageIdCapability");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { EventCapability } = require("../../assets/script/controller/capabilities/EventCapability");
        const { ctrl } = setupCtrl();
        const calls: any[] = [];
        const cb = (p: any) => calls.push(p);
        EventCapability.on(ctrl, "stateChanged", cb);

        const target = ctrl._states[1];
        SelectedPageIdCapability.setStateById(ctrl, target.stateId);
        expect(calls.length).toBe(1);
        expect(calls[0].toState).toBe(1);

        EventCapability.off(ctrl, "stateChanged", cb);
    });
});
