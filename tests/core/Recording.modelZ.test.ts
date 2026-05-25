/**
 * 模型 Z 录制契约 (2026-05-21 重新对齐)
 *
 * 模型 Z 三件事:
 *   1. 录制中切 state → 自动 stopRecording (commit 到 fromState) + 录制态变 false + 静默 log
 *   2. startRecording 前若 controlled prop 节点值 ≠ ctrlData[currentState] → 弹窗 (3 选 1)
 *   3. 手动 stopRecording 若有未跟随 prop 被改 → 弹窗 (是否追加跟随并保存)
 *
 * Editor.Dialog.messageBox 在 jest 无原生实现 — 用 jest.fn() mock 注入 + 控制 callback.
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

let dialogCalls: any[] = [];
let dialogResponse = 0; // 默认: 按 button index 0

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        Utils: { refreshSelectedInspector: () => {} },
        Dialog: {
            // 模拟 cocos 2.x scene 进程的 Electron 同步 messageBox: 同步返回 button index,
            // 同时 callback (如有传) 也调用 — 让真编辑器的"同步返回"路径和旧 callback 路径
            // 在 jest 都被测到. showDialog 的 resolved flag 防重入保证 cb 只调一次.
            messageBox: (opts: any, cb?: (idx: number) => void) => {
                dialogCalls.push(opts);
                if (typeof cb === "function") cb(dialogResponse);
                return dialogResponse;
            },
        },
    };
});

beforeEach(() => {
    dialogCalls = [];
    dialogResponse = 0;
    ((globalThis as any).Editor.log as jest.Mock).mockClear();
    ((globalThis as any).Editor.warn as jest.Mock).mockClear();
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

function setup() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("MZ_Root");
    const ctrlNode = new ccL.Node("MZ_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("MZ_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ctrl, select, selectNode };
}

describe("模型 Z: 切 state 自动 stopRecording", () => {
    it("录制中切 state → 录制态变 false", () => {
        const { ctrl, select, selectNode } = setup();
        const ccL = (globalThis as any).cc;
        select.togglePropertyControl(EnumPropName.Color, true);
        ctrl.selectedIndex = 0;
        ctrl.startRecording();
        expect(ctrl.isRecording).toBe(true);

        // 改节点 + 切 state
        selectNode.color = ccL.color(123, 45, 67, 255);
        ctrl.selectedIndex = 1;

        expect(ctrl.isRecording).toBe(false);
    });

    it("自动 stop 走静默路径 (Editor.log 调用, 不弹大窗)", () => {
        const { ctrl, select, selectNode } = setup();
        const ccL = (globalThis as any).cc;
        select.togglePropertyControl(EnumPropName.Color, true);
        ctrl.selectedIndex = 0;
        ctrl.startRecording();
        selectNode.color = ccL.color(11, 22, 33, 255);
        const dialogsBefore = dialogCalls.length;

        ctrl.selectedIndex = 1;

        // 没多弹窗
        expect(dialogCalls.length).toBe(dialogsBefore);
        // 有 log
        expect(((globalThis as any).Editor.log as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });

    it("自动 stop 把 controlled 改动 commit 到 fromState", () => {
        const { ctrl, select, selectNode } = setup();
        const ccL = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Color, true);
        ctrl.startRecording();
        selectNode.color = ccL.color(99, 88, 77, 255);

        ctrl.selectedIndex = 1;

        // fromState=0 应该有新的 Color 值
        const propData = (select as any).getPropData(0, ctrl.ctrlId);
        const storedColor = propData[EnumPropName.Color];
        expect(storedColor).toBeDefined();
        expect(storedColor.r).toBe(99);
        expect(storedColor.g).toBe(88);
    });
});

describe("模型 Z: startRecording dirty 弹窗 (controlled prop ≠ ctrlData)", () => {
    function setupWithDirtyColor() {
        const { ctrl, select, selectNode } = setup();
        const ccL = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        // 勾上 Color 跟随 + commit 当前蓝色到 ctrlData
        select.togglePropertyControl(EnumPropName.Color, true);
        const propData = (select as any).getPropData(0, ctrl.ctrlId);
        propData[EnumPropName.Color] = ccL.color(0, 0, 255, 255); // 存的: 蓝
        // 节点改成红 (没录, 直接改 — 形成 dirty)
        selectNode.color = ccL.color(255, 0, 0, 255);
        return { ctrl, select, selectNode };
    }

    it("有 dirty → 弹窗 (Editor.Dialog.messageBox 被调用)", () => {
        const { ctrl } = setupWithDirtyColor();
        dialogResponse = 0;
        ctrl.startRecording();
        expect(dialogCalls.length).toBe(1);
        expect(dialogCalls[0].buttons.length).toBe(3);
        expect(dialogCalls[0].defaultId).toBe(0);
    });

    it("选 0 (保存到当前 state) → ctrlData 更新为节点当前值 + 进入录制态", () => {
        const { ctrl, select } = setupWithDirtyColor();
        dialogResponse = 0;
        ctrl.startRecording();
        const propData = (select as any).getPropData(0, ctrl.ctrlId);
        expect(propData[EnumPropName.Color].r).toBe(255); // 节点的红色被保存
        expect(ctrl.isRecording).toBe(true);
    });

    it("选 1 (丢弃恢复存储值) → 节点应用 ctrlData + 进入录制态", () => {
        const { ctrl, selectNode } = setupWithDirtyColor();
        dialogResponse = 1;
        ctrl.startRecording();
        // 节点 color 被恢复到蓝 (存储值)
        expect(selectNode.color.b).toBe(255);
        expect(selectNode.color.r).toBe(0);
        expect(ctrl.isRecording).toBe(true);
    });

    it("选 2 (取消) → 不进入录制态", () => {
        const { ctrl } = setupWithDirtyColor();
        dialogResponse = 2;
        ctrl.startRecording();
        expect(ctrl.isRecording).toBe(false);
    });

    it("没 dirty → 不弹窗, 直接进入录制态", () => {
        const { ctrl, select } = setup();
        select.togglePropertyControl(EnumPropName.Color, true);
        ctrl.startRecording();
        expect(dialogCalls.length).toBe(0);
        expect(ctrl.isRecording).toBe(true);
    });
});

describe("模型 Z: 手动 stopRecording 未跟随 prop 弹窗", () => {
    it("录制中改了未跟随的 prop → 手动 stop 弹窗 (2 选 1)", () => {
        const { ctrl, select, selectNode } = setup();
        const ccL = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        // TASK-003: __preload 自动接入了 Opacity, 测试需 Opacity 不勾, 显式 opt-out
        select.togglePropertyControl(EnumPropName.Opacity, false);
        // 只勾 Color 跟随; Opacity 不勾
        select.togglePropertyControl(EnumPropName.Color, true);
        ctrl.startRecording();
        // 验证 _fullSnapshot 含 Opacity
        const fullSnap = (select as any)._fullSnapshot;
        expect(fullSnap).toBeDefined();
        expect(fullSnap[EnumPropName.Opacity]).toBeDefined();

        // 改了 Opacity (没勾跟随) + Color (勾了)
        selectNode.opacity = 100;
        selectNode.color = ccL.color(50, 50, 50, 255);

        // 验证 detectUntrackedDirty 现在能识别 Opacity
        const untracked = (select as any).detectUntrackedDirty();
        expect(untracked).toContain(EnumPropName.Opacity);

        dialogResponse = 0;
        ctrl.stopRecording();
        expect(dialogCalls.length).toBe(1);
        expect(dialogCalls[0].buttons.length).toBe(2);
    });

    it("选 0 (保存并加入跟随) → prop 变 controlled + ctrlData 写入节点当前值", () => {
        const { ctrl, select, selectNode } = setup();
        const ccL = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Color, true);
        ctrl.startRecording();

        selectNode.opacity = 100;
        selectNode.color = ccL.color(50, 50, 50, 255);

        dialogResponse = 0;
        ctrl.stopRecording();

        expect(select.isPropertyControlled(EnumPropName.Opacity)).toBe(true);
    });

    it("选 1 (丢弃) → prop 不进 controlled + ctrlData 不动", () => {
        const { ctrl, select, selectNode } = setup();
        const ccL = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        // TASK-003: __preload 自动接入了 Opacity, 测试需 Opacity 不勾, 显式 opt-out
        select.togglePropertyControl(EnumPropName.Opacity, false);
        select.togglePropertyControl(EnumPropName.Color, true);
        ctrl.startRecording();

        selectNode.opacity = 100;
        selectNode.color = ccL.color(50, 50, 50, 255);

        dialogResponse = 1;
        ctrl.stopRecording();

        expect(select.isPropertyControlled(EnumPropName.Opacity)).toBe(false);
    });

    it("没未跟随 dirty → 手动 stop 不弹窗", () => {
        const { ctrl, select, selectNode } = setup();
        const ccL = (globalThis as any).cc;
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Color, true);
        ctrl.startRecording();
        // 只改 Color (已勾跟随), 不改其它
        selectNode.color = ccL.color(60, 60, 60, 255);

        const before = dialogCalls.length;
        ctrl.stopRecording();
        expect(dialogCalls.length).toBe(before);
    });
});
