/**
 * 契约: 被排除的 prop 在录制中被改, cancelRecording 后还原到录制前.
 *
 * 用户裁定: 任何被排除的属性, 录制取消后都应回到录制前的状态 (排除 = 状态系统/录制不该
 * 改它, 录制取消更要还原它, 否则排除在录制场景下形同虚设).
 *
 * 实现: 录制开始时额外给被排除 prop 拍一份纯节点值快照 (_excludedSnapshot), 仅用于 cancel
 * 还原节点; 不写进 ctrlData, 不进 _fullSnapshot (保持"排除不进状态数据"的不变量#8).
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
const ControllerMod = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelectV2");

const { StateControllerV2 } = ControllerMod;
const { StateSelectV2 } = SelectMod;

function setup() {
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

    return { root, ctrl, select, selectNode };
}

describe("排除 prop 录制中被改 → cancel 还原", () => {
    it("排除 x,y,opacity 后录制改它们 → cancelRecording 还原节点到录制前", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.selectedIndex = 0;

        // 录制前稳态
        selectNode.x = 100;
        selectNode.y = 200;
        selectNode.opacity = 128;

        // 用户在排除清单勾选 (模拟 inspector +/-), 触发 reconcile 退出跟随
        (select as any)._userExcludedProps = ["cc.Node.x", "cc.Node.y", "cc.Node.opacity"];
        void (select as any).excludedPropsDisplay;

        // 录制 → 改被排除的 prop → 取消
        ctrl.startRecording();
        selectNode.x = 999;
        selectNode.y = 888;
        selectNode.opacity = 10;
        (ctrl as any).cancelRecording();

        expect(selectNode.x).toBe(100);
        expect(selectNode.y).toBe(200);
        expect(selectNode.opacity).toBe(128);
    });

    it("排除 x,y 后录制改它们 → stopRecording(保存) 也还原被排除 prop, 但不影响已跟随 prop 的提交", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.selectedIndex = 0;

        selectNode.x = 100;
        selectNode.y = 200;
        selectNode.opacity = 50; // 未排除, 跟随中 — 停止应保存改后值

        (select as any)._userExcludedProps = ["cc.Node.x", "cc.Node.y"];
        void (select as any).excludedPropsDisplay;

        // 点录制 = start → 改 → 再点录制 = stopRecording(保存)
        (select as any).recordTrigger = true;
        selectNode.x = 999;
        selectNode.y = 888;
        selectNode.opacity = 200;
        (select as any).recordTrigger = true;

        expect(ctrl.isRecording).toBe(false);
        // 被排除的 x,y 还原到录制前
        expect(selectNode.x).toBe(100);
        expect(selectNode.y).toBe(200);
        // 未排除的 opacity 保存改后值 (跟随提交不受影响)
        expect(selectNode.opacity).toBe(200);
    });

    it("无排除项时 cancel 不抛 (空 _excludedSnapshot 安全)", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.selectedIndex = 0;
        selectNode.x = 5;
        void (select as any).excludedPropsDisplay;
        ctrl.startRecording();
        expect(() => (ctrl as any).cancelRecording()).not.toThrow();
        expect(ctrl.isRecording).toBe(false);
    });
});
