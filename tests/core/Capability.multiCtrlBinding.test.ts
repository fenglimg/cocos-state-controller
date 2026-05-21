/**
 * MultiCtrlBindingCapability 契约 (Wave 5 T02)
 *
 * 声明式跨 ctrl 状态联动: ctrlA 切到 stateId X → ctrlB 自动切到 stateId Y.
 *
 *   addBinding(sourceCtrl, sourceStateId, targetCtrl, targetStateId) → boolean
 *   removeBinding(sourceCtrl, sourceStateId, targetCtrl) → boolean
 *   listBindings(sourceCtrl) → [{sourceStateId, targetCtrl, targetStateId}]
 *   clearAllBindings(sourceCtrl)
 *
 * 经 EventCapability 桥接, 命中 source state 后 setStateById 到 target. 同 source 同 stateId
 * 重复 add 覆盖. 防无限循环 (binding 触发的链式切换不再触发后续 binding).
 *
 * Red: 模块不存在.
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
const { StateController } = require("../../assets/script/controller/StateController");

function setupCtrl(name?: string) {
    const ccLocal = (globalThis as any).cc;
    const ctrlNode = new ccLocal.Node(name || "CtrlNode");
    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    return { ctrl };
}

describe("MultiCtrlBindingCapability (Wave 5 T02)", () => {
    it("模块存在 + name = multiCtrlBinding + 注册", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/capabilities/MultiCtrlBindingCapability");
        expect(Mod.MultiCtrlBindingCapability).toBeDefined();
        expect(Mod.MultiCtrlBindingCapability.name).toBe("multiCtrlBinding");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        expect(CapabilityRegistry.get("multiCtrlBinding")).toBeDefined();
    });

    it("addBinding(A, sourceId, B, targetId) → A 切到 sourceId 时 B 自动跟到 targetId", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MultiCtrlBindingCapability } = require("../../assets/script/controller/capabilities/MultiCtrlBindingCapability");

        const A = setupCtrl("A");
        const B = setupCtrl("B");
        const aS1Id = A.ctrl._states[1].stateId;
        const bS1Id = B.ctrl._states[1].stateId;

        const ok = MultiCtrlBindingCapability.addBinding(A.ctrl, aS1Id, B.ctrl, bS1Id);
        expect(ok).toBe(true);

        A.ctrl.selectedIndex = 1;
        expect(B.ctrl.selectedIndex).toBe(1);

        MultiCtrlBindingCapability.clearAllBindings(A.ctrl);
    });

    it("listBindings 返回当前所有 binding", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MultiCtrlBindingCapability } = require("../../assets/script/controller/capabilities/MultiCtrlBindingCapability");

        const A = setupCtrl();
        const B = setupCtrl();
        const C = setupCtrl();
        MultiCtrlBindingCapability.addBinding(A.ctrl, A.ctrl._states[0].stateId, B.ctrl, B.ctrl._states[0].stateId);
        MultiCtrlBindingCapability.addBinding(A.ctrl, A.ctrl._states[1].stateId, C.ctrl, C.ctrl._states[1].stateId);

        const list = MultiCtrlBindingCapability.listBindings(A.ctrl);
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBe(2);

        MultiCtrlBindingCapability.clearAllBindings(A.ctrl);
    });

    it("removeBinding 后不再触发", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MultiCtrlBindingCapability } = require("../../assets/script/controller/capabilities/MultiCtrlBindingCapability");

        const A = setupCtrl();
        const B = setupCtrl();
        const aS1 = A.ctrl._states[1].stateId;
        const bS1 = B.ctrl._states[1].stateId;
        MultiCtrlBindingCapability.addBinding(A.ctrl, aS1, B.ctrl, bS1);

        // 先验证生效
        A.ctrl.selectedIndex = 1;
        expect(B.ctrl.selectedIndex).toBe(1);

        // 复位 + 删
        B.ctrl.selectedIndex = 0;
        A.ctrl.selectedIndex = 0;
        const ok = MultiCtrlBindingCapability.removeBinding(A.ctrl, aS1, B.ctrl);
        expect(ok).toBe(true);

        A.ctrl.selectedIndex = 1;
        expect(B.ctrl.selectedIndex).toBe(0);

        MultiCtrlBindingCapability.clearAllBindings(A.ctrl);
    });

    it("clearAllBindings 全清", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MultiCtrlBindingCapability } = require("../../assets/script/controller/capabilities/MultiCtrlBindingCapability");

        const A = setupCtrl();
        const B = setupCtrl();
        MultiCtrlBindingCapability.addBinding(A.ctrl, A.ctrl._states[1].stateId, B.ctrl, B.ctrl._states[1].stateId);
        MultiCtrlBindingCapability.clearAllBindings(A.ctrl);
        expect(MultiCtrlBindingCapability.listBindings(A.ctrl).length).toBe(0);

        A.ctrl.selectedIndex = 1;
        expect(B.ctrl.selectedIndex).toBe(0);
    });

    it("同 source 同 stateId 重复 add → 覆盖 (最后赢)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MultiCtrlBindingCapability } = require("../../assets/script/controller/capabilities/MultiCtrlBindingCapability");

        const A = setupCtrl();
        const B = setupCtrl();
        const aS1 = A.ctrl._states[1].stateId;
        MultiCtrlBindingCapability.addBinding(A.ctrl, aS1, B.ctrl, B.ctrl._states[0].stateId);
        MultiCtrlBindingCapability.addBinding(A.ctrl, aS1, B.ctrl, B.ctrl._states[1].stateId);

        A.ctrl.selectedIndex = 1;
        expect(B.ctrl.selectedIndex).toBe(1); // 第二个 add 赢

        MultiCtrlBindingCapability.clearAllBindings(A.ctrl);
    });

    it("targetStateId 找不到 → 不抛, 不切 target", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MultiCtrlBindingCapability } = require("../../assets/script/controller/capabilities/MultiCtrlBindingCapability");

        const A = setupCtrl();
        const B = setupCtrl();
        MultiCtrlBindingCapability.addBinding(A.ctrl, A.ctrl._states[1].stateId, B.ctrl, 9999);

        expect(() => { A.ctrl.selectedIndex = 1; }).not.toThrow();
        expect(B.ctrl.selectedIndex).toBe(0); // 没切

        MultiCtrlBindingCapability.clearAllBindings(A.ctrl);
    });

    it("循环防护: A→B, B→A 时, A.selectedIndex = 1 不死循环", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MultiCtrlBindingCapability } = require("../../assets/script/controller/capabilities/MultiCtrlBindingCapability");

        const A = setupCtrl();
        const B = setupCtrl();
        MultiCtrlBindingCapability.addBinding(A.ctrl, A.ctrl._states[1].stateId, B.ctrl, B.ctrl._states[1].stateId);
        MultiCtrlBindingCapability.addBinding(B.ctrl, B.ctrl._states[1].stateId, A.ctrl, A.ctrl._states[0].stateId);

        // 不死循环, 不报栈溢出
        let timedOut = false;
        const start = Date.now();
        try {
            A.ctrl.selectedIndex = 1;
        }
        catch (_) { /* ignore */ }
        if (Date.now() - start > 1000) timedOut = true;
        expect(timedOut).toBe(false);

        MultiCtrlBindingCapability.clearAllBindings(A.ctrl);
        MultiCtrlBindingCapability.clearAllBindings(B.ctrl);
    });

    it("空/null 参数 → 不抛, 返回安全值", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MultiCtrlBindingCapability } = require("../../assets/script/controller/capabilities/MultiCtrlBindingCapability");
        expect(MultiCtrlBindingCapability.addBinding(null, 0, null, 0)).toBe(false);
        expect(MultiCtrlBindingCapability.removeBinding(null, 0, null)).toBe(false);
        expect(MultiCtrlBindingCapability.listBindings(null)).toEqual([]);
        expect(() => MultiCtrlBindingCapability.clearAllBindings(null)).not.toThrow();
    });
});
