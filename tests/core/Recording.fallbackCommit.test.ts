/**
 * 兜底 commit 路径 (Wave 2 T16)
 *
 * 用户可能忘记 stopRecording / 直接关场景 / 移走节点, 需要兜底:
 *   1. cc.Director.EVENT_BEFORE_SCENE_LAUNCH: 场景切换前 stopRecording
 *   2. StateController.onDestroy: ctrl 销毁前 stopRecording (final commit)
 *   3. handleControllerTransition: 跨 ctrl 移动前 commit diff 到 oldCtrl
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

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;

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

describe("Recording fallback commit hooks (Wave 2 T16)", () => {
    it("EVENT_BEFORE_SCENE_LAUNCH 触发 stopRecording", () => {
        const { ctrl } = setup();
        ctrl.startRecording();
        expect(ctrl.isRecording).toBe(true);

        cc.director.emit && cc.director.emit(cc.Director.EVENT_BEFORE_SCENE_LAUNCH);

        expect(ctrl.isRecording).toBe(false);
    });

    it("onDestroy 在录制中触发 stopRecording (停录 before Delete 通知)", () => {
        const { ctrl } = setup();
        ctrl.startRecording();
        expect(ctrl.isRecording).toBe(true);

        // 拦截 stopRecording 调用
        let stopCalled = 0;
        const origStop = (ctrl as any).stopRecording.bind(ctrl);
        (ctrl as any).stopRecording = () => { stopCalled++; origStop(); };

        // 模拟 ctrl 销毁
        (ctrl as any).onDestroy();

        // onDestroy 应主动调用 stopRecording (用户未显式 stop, 也要兜底)
        expect(stopCalled).toBeGreaterThanOrEqual(1);
        expect(ctrl.isRecording).toBe(false);
    });

    it("跨 ctrl 移动: 录制中 handleControllerTransition 触发 final commit 到 oldCtrl", () => {
        const ccLocal = (globalThis as any).cc;
        const root = new ccLocal.Node("Root");
        const ctrlNode1 = new ccLocal.Node("Ctrl1");
        const ctrlNode2 = new ccLocal.Node("Ctrl2");
        root.addChild(ctrlNode1);
        root.addChild(ctrlNode2);

        const selectNode = new ccLocal.Node("Sel");
        ctrlNode1.addChild(selectNode);

        const ctrl1 = ctrlNode1.addComponent(StateController);
        (ctrl1 as any).__preload();
        const ctrl2 = ctrlNode2.addComponent(StateController);
        (ctrl2 as any).__preload();
        // 避免 ctrl1.ctrlId === ctrl2.ctrlId (Date.now 同一毫秒)
        if ((ctrl2 as any).ctrlId === (ctrl1 as any).ctrlId) {
            (ctrl2 as any).ctrlId = (ctrl1 as any).ctrlId + 1;
        }

        const select = selectNode.addComponent(StateSelect);
        (select as any).__preload();
        (ctrl1 as any).markCacheDirty();

        // 在 ctrl1 上录制 Color
        ctrl1.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Color, true);
        selectNode.color = ccLocal.color(255, 255, 255, 255);

        ctrl1.startRecording();
        selectNode.color = ccLocal.color(255, 0, 0, 255); // RED, 还未 commit

        // snapshot 在录制中应非空 (这是 transition 兜底前提条件)
        expect((select as any)._snapshot).toBeDefined();
        expect((select as any)._snapshot).not.toBeNull();

        // 直接调 handleControllerTransition 模拟跨 ctrl
        (select as any).handleControllerTransition(ctrlNode1, ctrlNode2);

        // 兜底分支: snapshot 已清空 (说明 commitRecordingDiff 已被调用)
        expect((select as any)._snapshot).toBeNull();
    });
});
