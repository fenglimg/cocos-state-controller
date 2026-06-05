/**
 * EventCapability 接入契约 (Wave 3 T01-T02)
 *
 * runtime API: 让代码订阅 controller state 切换事件.
 *
 *   EventCapability.on(ctrl, "stateChanged", cb)   // 注册
 *   EventCapability.off(ctrl, "stateChanged", cb)  // 注销
 *   EventCapability.once(ctrl, "stateChanged", cb) // 一次性
 *
 * payload: { ctrl, fromState, toState, fromName, toName }
 *
 * 实装: 借 CapabilityRegistry.onStateChanged hook 已经在 selectedIndex.setter 内 dispatch,
 * EventCapability 只在 onStateChanged 内 fanout 给 ctrl-local listener.
 *
 * 红预期: EventCapability 文件不存在 / 没注册.
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
const { StateController } = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelect } = require("../../assets/script/controller/StateSelectV2");

function setupCtrl() {
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

    return { ctrl, select };
}

describe("EventCapability (Wave 3 T01)", () => {
    it("模块存在 + name = event + 已注册到 Registry", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/capabilities/EventCapability");
        expect(Mod.EventCapability).toBeDefined();
        expect(Mod.EventCapability.name).toBe("event");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        expect(CapabilityRegistry.get("event")).toBeDefined();
    });

    it("on(ctrl, 'stateChanged', cb) → 切 state 时 cb 收到 payload", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { EventCapability } = require("../../assets/script/controller/capabilities/EventCapability");
        const { ctrl } = setupCtrl();
        const calls: any[] = [];
        const cb = (payload: any) => calls.push(payload);
        EventCapability.on(ctrl, "stateChanged", cb);

        ctrl.selectedIndex = 1;

        expect(calls.length).toBe(1);
        const p = calls[0];
        expect(p.ctrl).toBe(ctrl);
        expect(p.fromState).toBe(0);
        expect(p.toState).toBe(1);
        expect(p.fromName).toBe("1");
        expect(p.toName).toBe("2");

        EventCapability.off(ctrl, "stateChanged", cb);
    });

    it("off(ctrl, ...) 后 cb 不再触发", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { EventCapability } = require("../../assets/script/controller/capabilities/EventCapability");
        const { ctrl } = setupCtrl();
        const calls: any[] = [];
        const cb = (payload: any) => calls.push(payload);
        EventCapability.on(ctrl, "stateChanged", cb);

        ctrl.selectedIndex = 1;
        expect(calls.length).toBe(1);

        EventCapability.off(ctrl, "stateChanged", cb);
        ctrl.selectedIndex = 0;
        expect(calls.length).toBe(1); // 没增加
    });

    it("多个 cb 全部触发, 顺序 = 注册顺序", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { EventCapability } = require("../../assets/script/controller/capabilities/EventCapability");
        const { ctrl } = setupCtrl();
        const order: number[] = [];
        const cb1 = () => order.push(1);
        const cb2 = () => order.push(2);
        const cb3 = () => order.push(3);
        EventCapability.on(ctrl, "stateChanged", cb1);
        EventCapability.on(ctrl, "stateChanged", cb2);
        EventCapability.on(ctrl, "stateChanged", cb3);

        ctrl.selectedIndex = 1;
        expect(order).toEqual([1, 2, 3]);

        EventCapability.off(ctrl, "stateChanged", cb1);
        EventCapability.off(ctrl, "stateChanged", cb2);
        EventCapability.off(ctrl, "stateChanged", cb3);
    });

    it("一个 cb 抛错不影响其它 cb 与 core 切换", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { EventCapability } = require("../../assets/script/controller/capabilities/EventCapability");
        const { ctrl } = setupCtrl();
        const calls: number[] = [];
        const bomb = () => { throw new Error("boom"); };
        const good = () => { calls.push(1); };
        EventCapability.on(ctrl, "stateChanged", bomb);
        EventCapability.on(ctrl, "stateChanged", good);

        expect(() => { ctrl.selectedIndex = 1; }).not.toThrow();
        expect(ctrl.selectedIndex).toBe(1);
        expect(calls).toEqual([1]);

        EventCapability.off(ctrl, "stateChanged", bomb);
        EventCapability.off(ctrl, "stateChanged", good);
    });

    it("once(ctrl, ...) 只触发一次", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { EventCapability } = require("../../assets/script/controller/capabilities/EventCapability");
        const { ctrl } = setupCtrl();
        const calls: number[] = [];
        EventCapability.once(ctrl, "stateChanged", () => calls.push(1));

        ctrl.selectedIndex = 1;
        ctrl.selectedIndex = 0;
        expect(calls.length).toBe(1);
    });

    it("不同 ctrl 的 listener 互不干扰", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { EventCapability } = require("../../assets/script/controller/capabilities/EventCapability");
        const a = setupCtrl();
        const b = setupCtrl();
        const callsA: number[] = [];
        const callsB: number[] = [];
        const cbA = () => callsA.push(1);
        const cbB = () => callsB.push(1);
        EventCapability.on(a.ctrl, "stateChanged", cbA);
        EventCapability.on(b.ctrl, "stateChanged", cbB);

        a.ctrl.selectedIndex = 1;
        expect(callsA.length).toBe(1);
        expect(callsB.length).toBe(0);

        b.ctrl.selectedIndex = 1;
        expect(callsA.length).toBe(1);
        expect(callsB.length).toBe(1);

        EventCapability.off(a.ctrl, "stateChanged", cbA);
        EventCapability.off(b.ctrl, "stateChanged", cbB);
    });

    it("ctrl 销毁后 listener 自动清空 (避免内存泄漏)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { EventCapability } = require("../../assets/script/controller/capabilities/EventCapability");
        const { ctrl } = setupCtrl();
        const calls: number[] = [];
        EventCapability.on(ctrl, "stateChanged", () => calls.push(1));
        expect(EventCapability.listenerCount(ctrl, "stateChanged")).toBe(1);

        // 模拟 onDestroy
        if (typeof (ctrl as any).onDestroy === "function") {
            (ctrl as any).onDestroy();
        }
        EventCapability.clear(ctrl); // 显式 API, onDestroy 时 ctrl 应调用

        expect(EventCapability.listenerCount(ctrl, "stateChanged")).toBe(0);
    });
});
