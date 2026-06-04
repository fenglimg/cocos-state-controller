/**
 * TASK-003 (#F-A): cancelRecording 对 string propRef key 也回滚.
 *
 * 附录A 断言#2: cancelRecording() 后, number key 与 string propRef key **都**回到 _initialSnapshot.
 *
 * 根因 (修复前): applyRecordingSnapshot 只 `Number(key)` 遍历 _initialSnapshot, string propRef key
 * 被跳过 → 撤销录制对 string propRef 不回滚. T2 双轨统一后内置 prop 也走 string propRef key,
 * 故内置+自定义双双中招 (见 Recording.cancel cc.Node.color 回归). 修复: 回滚循环双 key 分发.
 *
 * 真 cocos 引擎集成测试. harness 同 Recording.cancel.test.ts.
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EnumPropName } = require("../../assets/script/controller/StateEnumV2");

const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

@ccclass("CancelPropRefFixture")
class CancelPropRefFixture extends ccL.Component {
    @property() public heat: number = 0;
}

const CUSTOM_PROPREF = "CancelPropRefFixture.heat";

function setup() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();
    selectNode.addComponent(CancelPropRefFixture);
    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ctrl, select, selectNode };
}

describe("#F-A cancelRecording 对 string propRef 回滚 (附录A 断言#2)", () => {
    it("自定义 propRef: cancelRecording 后 ctrlData 回到录制开始前的值", () => {
        const { ctrl, select, selectNode } = setup();
        const fixture = selectNode.getComponent(CancelPropRefFixture);

        ctrl.selectedIndex = 0;
        fixture.heat = 10;
        select.togglePropertyControl(CUSTOM_PROPREF, true); // propRef string key 接入
        // 把 baseline=10 commit 到 state[0]
        const pd0 = (select as any).getPropData(0, ctrl.ctrlId);
        pd0[CUSTOM_PROPREF] = 10;

        ctrl.startRecording();
        expect(ctrl.isRecording).toBe(true);

        // 录制中改值 → commit 到 state[0]
        fixture.heat = 99;
        (select as any).onStateWillChange(ctrl, 0);
        expect((select as any).getPropData(0, ctrl.ctrlId)[CUSTOM_PROPREF]).toBe(99);

        // cancelRecording → 应回滚到 10 (string propRef key 必须被处理, 非 Number(key) 跳过)
        (ctrl as any).cancelRecording();
        expect(ctrl.isRecording).toBe(false);
        expect((select as any).getPropData(0, ctrl.ctrlId)[CUSTOM_PROPREF]).toBe(10);
    });

    it("内置 propRef (cc.Node.active): cancelRecording 后回到录制开始前的值", () => {
        const { ctrl, select, selectNode } = setup();

        ctrl.selectedIndex = 0;
        selectNode.active = true;
        select.togglePropertyControl(EnumPropName.Active, true); // T2 后走 propRef string key
        const pd0 = (select as any).getPropData(0, ctrl.ctrlId);
        pd0["cc.Node.active"] = true;

        ctrl.startRecording();
        selectNode.active = false;
        (select as any).onStateWillChange(ctrl, 0);
        expect((select as any).getPropData(0, ctrl.ctrlId)["cc.Node.active"]).toBe(false);

        (ctrl as any).cancelRecording();
        expect((select as any).getPropData(0, ctrl.ctrlId)["cc.Node.active"]).toBe(true);
    });
});

export {};
