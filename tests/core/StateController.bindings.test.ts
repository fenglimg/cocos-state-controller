/**
 * StateController 可序列化跨控制器联动 (二期支柱 B)
 *
 * 现状: MultiCtrlBindingCapability 的 binding 存进程级 WeakMap + target 对象引用, 不进场景序列化,
 * 编辑器静态观测看不到。本特性给 StateController 加:
 *   - 序列化字段 _bindingsData (JSON 串, 用 targetCtrlId 数字代替对象引用)
 *   - 公开 API: addBinding(sourceStateId, targetCtrlId, targetStateId) / removeBinding / getBindings / clearBindings
 *   - 静态注册表 StateController.getById(ctrlId)
 *   - rehydrateBindings(): 把序列化 binding 解析 id→ctrl 对象, 复用 MultiCtrlBindingCapability 接线 (运行时 start 调用)
 *
 * Red: 这些 API 尚不存在。
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SelectedPageIdCapability } = require("../../assets/script/controller/capabilities/SelectedPageIdCapability");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MultiCtrlBindingCapability } = require("../../assets/script/controller/capabilities/MultiCtrlBindingCapability");

let idSeq = 990000;
function setupCtrl(name?: string) {
    const ccLocal = (globalThis as any).cc;
    const node = new ccLocal.Node(name || "CtrlNode");
    const ctrl = node.addComponent(StateController);
    ctrl.ctrlId = ++idSeq;           // 显式唯一 id (Date.now() 同毫秒会撞)
    (ctrl as any).__preload();
    return ctrl;
}

describe("StateController 可序列化跨控制器联动 (支柱 B)", () => {
    it("静态注册表: __preload 后 StateController.getById(ctrlId) 拿到实例", () => {
        const a = setupCtrl("A");
        expect(typeof StateController.getById).toBe("function");
        expect(StateController.getById(a.ctrlId)).toBe(a);
    });

    it("addBinding 写入序列化数据, getBindings 读回", () => {
        const a = setupCtrl("A");
        const ok = a.addBinding(10, 777, 20);
        expect(ok).toBe(true);
        const list = a.getBindings();
        expect(list).toEqual([{ sourceStateId: 10, targetCtrlId: 777, targetStateId: 20 }]);
    });

    it("序列化进 _bindingsData (字符串), 可被反序列化复原", () => {
        const a = setupCtrl("A");
        a.addBinding(1, 555, 2);
        expect(typeof a._bindingsData).toBe("string");
        // 模拟反序列化: 新实例只灌 _bindingsData → getBindings 一致
        const b = setupCtrl("B");
        b._bindingsData = a._bindingsData;
        expect(b.getBindings()).toEqual([{ sourceStateId: 1, targetCtrlId: 555, targetStateId: 2 }]);
    });

    it("addBinding 同 (sourceStateId, targetCtrlId) 覆盖 targetStateId, 不重复", () => {
        const a = setupCtrl("A");
        a.addBinding(1, 555, 2);
        a.addBinding(1, 555, 9);
        expect(a.getBindings()).toEqual([{ sourceStateId: 1, targetCtrlId: 555, targetStateId: 9 }]);
    });

    it("removeBinding 删除指定 (sourceStateId, targetCtrlId)", () => {
        const a = setupCtrl("A");
        a.addBinding(1, 555, 2);
        a.addBinding(1, 666, 3);
        expect(a.removeBinding(1, 555)).toBe(true);
        expect(a.getBindings()).toEqual([{ sourceStateId: 1, targetCtrlId: 666, targetStateId: 3 }]);
        expect(a.removeBinding(1, 555)).toBe(false);
    });

    it("rehydrateBindings: 序列化 binding 经 id 解析驱动运行时跨控制器切换", () => {
        const A = setupCtrl("A");
        const B = setupCtrl("B");
        const aSrc = A._states[1].stateId;
        const bTgt = B._states[1].stateId;

        A.addBinding(aSrc, B.ctrlId, bTgt);
        A.rehydrateBindings();           // 解析 B.ctrlId → B 实例, 接线

        SelectedPageIdCapability.setStateById(A, aSrc);
        expect(SelectedPageIdCapability.getSelectedStateId(B)).toBe(bTgt);
    });

    it("rehydrate 目标 ctrlId 未注册时跳过, 不抛", () => {
        const A = setupCtrl("A");
        A.addBinding(A._states[1].stateId, 123456, 0);
        expect(() => A.rehydrateBindings()).not.toThrow();
    });

    it("向后兼容: 对象式 MultiCtrlBindingCapability.addBinding 仍可用", () => {
        const A = setupCtrl("A");
        const B = setupCtrl("B");
        const aSrc = A._states[1].stateId;
        const bTgt = B._states[1].stateId;
        MultiCtrlBindingCapability.clearAllBindings(A);
        MultiCtrlBindingCapability.addBinding(A, aSrc, B, bTgt);
        SelectedPageIdCapability.setStateById(A, aSrc);
        expect(SelectedPageIdCapability.getSelectedStateId(B)).toBe(bTgt);
    });
});
