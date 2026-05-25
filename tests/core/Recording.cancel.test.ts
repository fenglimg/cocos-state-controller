/**
 * cancelRecording 撤销契约 (TASK-002, 模型 Z inspector 闭环).
 *
 * 契约:
 *   - cancelRecording 把 ctrlData[recordingStartState] 回滚到录制开始前的值
 *   - cancelRecording 后 _recording=false
 *   - cancelRecording 不触发 onRecordingStop 路径 (不发 CapabilityRegistry.dispatch onRecordingStop)
 *   - 录制中 states/move/copy/remove 入口被拒 (warn + return), state 列表不变
 *
 * 红预期: 当前 StateController 没有 cancelRecording 方法 / 录制中 states 等仍可改。
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
const RegistryMod = require("../../assets/script/controller/CapabilityRegistry");

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;
const { CapabilityRegistry } = RegistryMod;

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

describe("cancelRecording 契约 (TASK-002)", () => {
    it("StateController 暴露 cancelRecording 方法", () => {
        const { ctrl } = setup();
        expect(typeof (ctrl as any).cancelRecording).toBe("function");
    });

    it("cancelRecording 后 _recording=false 且 ctrlData[fromState] 回滚到录制开始前的值", () => {
        const { ctrl, select, selectNode } = setup();
        const ccLocal = (globalThis as any).cc;

        // 启用 Color, 录制开始前 = RED
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Color, true);
        selectNode.color = ccLocal.color(255, 0, 0, 255);

        // 把 RED commit 到 state[0] (模拟录制开始前的稳态)
        const propData0Before = (select as any).getPropData(0, ctrl.ctrlId);
        propData0Before["cc.Node.color"] = ccLocal.color(255, 0, 0, 255);
        const redCopy = ccLocal.color(255, 0, 0, 255);

        // 进入录制态
        ctrl.startRecording();
        expect(ctrl.isRecording).toBe(true);

        // 录制中改节点 color = GREEN, commit 到 state[0]
        selectNode.color = ccLocal.color(0, 255, 0, 255);
        // 走 onStateWillChange 路径会 commit, 但这里直接模拟 commit:
        (select as any).onStateWillChange(ctrl, 0);

        // 验证 state[0] 此刻是 GREEN
        const propData0Mid = (select as any).getPropData(0, ctrl.ctrlId);
        expect(propData0Mid["cc.Node.color"].g).toBe(255);

        // ★ cancelRecording: 应把 ctrlData[0] 回滚到 RED
        (ctrl as any).cancelRecording();

        expect(ctrl.isRecording).toBe(false);
        const propData0After = (select as any).getPropData(0, ctrl.ctrlId);
        expect(propData0After["cc.Node.color"].r).toBe(redCopy.r);
        expect(propData0After["cc.Node.color"].g).toBe(redCopy.g);
        expect(propData0After["cc.Node.color"].b).toBe(redCopy.b);
    });

    it("cancelRecording 不触发 onRecordingStop 路径 (不发 CapabilityRegistry.dispatch onRecordingStop)", () => {
        const { ctrl } = setup();
        let stopCalls = 0;
        let cancelCalls = 0;

        const spy = {
            name: "_test_cancel_spy",
            onRecordingStop: () => { stopCalls++; },
            onRecordingCancel: () => { cancelCalls++; },
        };
        CapabilityRegistry.register(spy);
        try {
            ctrl.startRecording();
            (ctrl as any).cancelRecording();

            expect(stopCalls).toBe(0);
            expect(cancelCalls).toBe(1);
        }
        finally {
            CapabilityRegistry.unregister("_test_cancel_spy");
        }
    });

    it("cancelRecording 在非录制态时 no-op (幂等)", () => {
        const { ctrl } = setup();
        expect(ctrl.isRecording).toBe(false);
        expect(() => (ctrl as any).cancelRecording()).not.toThrow();
        expect(ctrl.isRecording).toBe(false);
    });

    it("录制中改 states (调 states setter) 被拒, state 列表不变", () => {
        const { ctrl } = setup();
        ctrl.startRecording();
        const beforeLen = ctrl._states.length;
        const before0 = ctrl._states[0];
        // 通过 setter (cocos 编辑器数组 UI 的入口) 改 states
        const newStates = ctrl._states.slice();
        newStates.push(before0); // 试图加一个
        (ctrl as any).states = newStates;
        expect(ctrl._states.length).toBe(beforeLen);
    });

    it("录制中调 moveStateUp/Down (走 adjustSelectedStateOrder) 被拒", () => {
        const { ctrl } = setup();
        ctrl.selectedIndex = 1;
        ctrl.startRecording();
        const order0Before = ctrl._states[0].stateId;
        const order1Before = ctrl._states[1].stateId;
        (ctrl as any).moveStateUp = true;
        expect(ctrl._states[0].stateId).toBe(order0Before);
        expect(ctrl._states[1].stateId).toBe(order1Before);
    });

    it("录制中调 duplicateCurrentState (走 copySelectedState) 被拒", () => {
        const { ctrl } = setup();
        ctrl.startRecording();
        const beforeLen = ctrl._states.length;
        (ctrl as any).duplicateCurrentState = true;
        expect(ctrl._states.length).toBe(beforeLen);
    });

    it("录制中调 deleteCurrentState (走 removeSelectedState) 被拒", () => {
        const { ctrl } = setup();
        // 让 _states 多一个, 让 removeSelectedState 不会被 length<=1 拦下
        ctrl.startRecording();
        const beforeLen = ctrl._states.length;
        (ctrl as any).deleteCurrentState = true;
        expect(ctrl._states.length).toBe(beforeLen);
    });
});
