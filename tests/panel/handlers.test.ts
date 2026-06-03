/**
 * state-controller-panel IPC handler 契约 (Wave 3 Panel scaffold)
 *
 * scene-accessor.js 的纯函数层. 不依赖 Cocos Editor 全局, 接收 ctrl 实例 + 参数返回结果.
 * Cocos IPC 路由层 (scene-accessor.js 顶层 message handler) 在外面包一层 uuid 查找 + event.reply.
 *
 * 红预期: packages/state-controller-panel/lib/handlers.js 不存在.
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
const { StateSelect } = require("../../assets/script/controller/StateSelect");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EnumPropName } = require("../../assets/script/controller/StateEnum");

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

    return { ctrl, select, selectNode };
}

describe("Panel handlers (Wave 3 scaffold)", () => {
    it("模块存在, 暴露全部 v0.2 §2 RPC method", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        expect(typeof h.getCtrlSnapshot).toBe("function");
        expect(typeof h.setSelectedIndex).toBe("function");
        expect(typeof h.setStateById).toBe("function");
        expect(typeof h.setRecording).toBe("function");
        expect(typeof h.cancelRecording).toBe("function");
        expect(typeof h.addState).toBe("function");
        expect(typeof h.removeState).toBe("function");
        expect(typeof h.addProperty).toBe("function");
        expect(typeof h.installBroadcastBridge).toBe("function");
    });

    it("cancelRecording handler 调用 ctrl.cancelRecording", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl } = setupCtrl();
        ctrl.startRecording();
        expect(ctrl.isRecording).toBe(true);
        expect(h.cancelRecording(ctrl)).toBe(true);
        expect(ctrl.isRecording).toBe(false);
        // null ctrl no-op
        expect(h.cancelRecording(null)).toBe(false);
    });

    it("getCtrlSnapshot(ctrl) 返回 ctrlId/ctrlName/selectedIndex/isRecording/states 列表", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl } = setupCtrl();
        const snap = h.getCtrlSnapshot(ctrl);
        expect(snap.ctrlId).toBe(ctrl.ctrlId);
        expect(typeof snap.ctrlName).toBe("string");
        expect(snap.selectedIndex).toBe(0);
        expect(snap.isRecording).toBe(false);
        expect(Array.isArray(snap.states)).toBe(true);
        expect(snap.states.length).toBe(2);
        expect(snap.states[0]).toEqual({ index: 0, stateId: ctrl._states[0].stateId, name: "1" });
    });

    it("setSelectedIndex(ctrl, idx) 切到指定 index, 返回 true", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl } = setupCtrl();
        expect(h.setSelectedIndex(ctrl, 1)).toBe(true);
        expect(ctrl.selectedIndex).toBe(1);
    });

    it("setSelectedIndex 越界 → 返回 false, 不动 ctrl", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl } = setupCtrl();
        ctrl.selectedIndex = 1;
        expect(h.setSelectedIndex(ctrl, 99)).toBe(false);
        expect(h.setSelectedIndex(ctrl, -1)).toBe(false);
        expect(ctrl.selectedIndex).toBe(1);
    });

    it("setStateById(ctrl, stateId) 走 SelectedPageIdCapability, 返回 true/false", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl } = setupCtrl();
        const target = ctrl._states[1];
        expect(h.setStateById(ctrl, target.stateId)).toBe(true);
        expect(ctrl.selectedIndex).toBe(1);
        expect(h.setStateById(ctrl, 9999)).toBe(false);
    });

    it("setRecording(ctrl, true) → ctrl.startRecording; setRecording(ctrl, false) → stopRecording", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl } = setupCtrl();
        expect(h.setRecording(ctrl, true)).toBe(true);
        expect(ctrl.isRecording).toBe(true);
        expect(h.setRecording(ctrl, false)).toBe(true);
        expect(ctrl.isRecording).toBe(false);
    });

    it("addState(ctrl, name) 新增 state, 返回新 stateId", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl } = setupCtrl();
        const beforeLen = ctrl._states.length;
        const newId = h.addState(ctrl, "MyState");
        expect(typeof newId).toBe("number");
        expect(ctrl._states.length).toBe(beforeLen + 1);
        const found = ctrl._states.find((s: any) => s.stateId === newId);
        expect(found).toBeDefined();
        expect(found.name).toBe("MyState");
    });

    it("removeState(ctrl, index) 删除指定 index", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl } = setupCtrl();
        h.addState(ctrl, "A");
        h.addState(ctrl, "B");
        const beforeLen = ctrl._states.length;
        const targetName = ctrl._states[1].name;
        expect(h.removeState(ctrl, 1)).toBe(true);
        expect(ctrl._states.length).toBe(beforeLen - 1);
        // 旧 index 1 的 name 不应该再在列表里 (除非有同名 — 这里没)
        expect(ctrl._states.find((s: any) => s.name === targetName)).toBeUndefined();
    });

    it("removeState 最后一个 → 拒绝 (保留至少 1 个 state), 返回 false", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl } = setupCtrl();
        // 删到只剩 1 个
        h.removeState(ctrl, 1);
        expect(ctrl._states.length).toBe(1);
        // 再删应被拒
        expect(h.removeState(ctrl, 0)).toBe(false);
        expect(ctrl._states.length).toBe(1);
    });

    it("addProperty(ctrl, select, propType) 调 select.togglePropertyControl", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl, select, selectNode } = setupCtrl();
        const ccLocal = (globalThis as any).cc;
        selectNode.position = ccLocal.v3(0, 0, 0);
        ctrl.selectedIndex = 0;

        expect(h.addProperty(ctrl, select, EnumPropName.Position)).toBe(true);
        const propData = (select as any)._ctrlData[ctrl.ctrlId][0];
        // 聚合根治: Position 拆子项存储 (decompose 模型)
        expect(propData["cc.Node.x"]).toBeDefined();
    });

    it("removeProperty handler 调用 select.togglePropertyControl(propType, false)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl, select } = setupCtrl();
        // TASK-003: __preload 自动接入了 Color, 直接 removeProperty 即可
        expect(select.isPropertyControlled(EnumPropName.Color)).toBe(true);
        expect(h.removeProperty(ctrl, select, EnumPropName.Color)).toBe(true);
        expect(select.isPropertyControlled(EnumPropName.Color)).toBe(false);
        // null ctrl/select no-op
        expect(h.removeProperty(null, select, EnumPropName.Color)).toBe(false);
        expect(h.removeProperty(ctrl, null, EnumPropName.Color)).toBe(false);
    });

    it("installBroadcastBridge: stateChanged → 通过 send(name, payload) 转发", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl } = setupCtrl();
        const broadcasts: any[] = [];
        const send = (name: string, payload: any) => broadcasts.push({ name, payload });

        const unsub = h.installBroadcastBridge(ctrl, send);
        ctrl.selectedIndex = 1;

        const stateChangedMsg = broadcasts.find(b => b.name === "onStateChanged");
        expect(stateChangedMsg).toBeDefined();
        expect(stateChangedMsg.payload.toState).toBe(1);
        expect(stateChangedMsg.payload.ctrlId).toBe(ctrl.ctrlId);

        // unsub 后不再收
        unsub();
        const before = broadcasts.length;
        ctrl.selectedIndex = 0;
        expect(broadcasts.length).toBe(before);
    });

    it("installBroadcastBridge: setRecording 触发 onRecordingChanged", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        const { ctrl } = setupCtrl();
        const broadcasts: any[] = [];
        const send = (name: string, payload: any) => broadcasts.push({ name, payload });

        const unsub = h.installBroadcastBridge(ctrl, send);
        h.setRecording(ctrl, true);

        const recMsg = broadcasts.find(b => b.name === "onRecordingChanged");
        expect(recMsg).toBeDefined();
        expect(recMsg.payload.isRecording).toBe(true);
        expect(recMsg.payload.ctrlId).toBe(ctrl.ctrlId);

        unsub();
    });

    it("空/null ctrl → 所有 handler 不抛, 返回 false / null", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const h = require("../../packages/state-controller-panel/lib/handlers");
        expect(() => h.getCtrlSnapshot(null)).not.toThrow();
        expect(h.setSelectedIndex(null, 0)).toBe(false);
        expect(h.setRecording(null, true)).toBe(false);
        expect(h.addState(null, "X")).toBe(-1);
        expect(h.removeState(null, 0)).toBe(false);
    });
});
