/**
 * 录制中切 state 时, fromState 应被 commit diff (Wave 2 T07 e2e)
 *
 * 场景: 用户进入 state0, 改 prop, 切到 state1, 再改 prop, 再切回 state0;
 *      期望: state0 / state1 各自数据持久化, 切回时正确 apply。
 *
 * 流程:
 *   1. startRecording (在 state 0)
 *   2. 改 selectNode.color = RED → 节点 dirty (尚未 commit)
 *   3. selectedIndex = 1 → onStateWillChange 应触发 commit diff (RED 写入 ctrlData[state0][Color])
 *   4. onStateChanged 应触发重拍 snapshot (snapshot 为 state1 的 baseline)
 *   5. 改 selectNode.color = BLUE
 *   6. selectedIndex = 0 → commit BLUE 写入 ctrlData[state1][Color]
 *   7. 切回 state 0, color 应 apply RED
 *   8. stopRecording
 *
 * 红预期: 当前 StateSelect 没有 onStateWillChange / onStateChanged, 切 state 不 commit diff。
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

describe("Recording diff commit on state switch (Wave 2 T07 e2e)", () => {
    it("切 state 时 fromState 数据被 commit, 切回时 apply 回原值", () => {
        const { ctrl, select, selectNode } = setup();
        const ccLocal = (globalThis as any).cc;

        // 启用 Color 控制 + 录制
        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Color, true);
        // state0 起始为 WHITE
        selectNode.color = ccLocal.color(255, 255, 255, 255);

        ctrl.startRecording();

        // step 1: 在 state0 把节点改成 RED
        selectNode.color = ccLocal.color(255, 0, 0, 255);

        // step 2: 切到 state1 → 应触发 commit diff, ctrlData[ctrl][0][Color] = RED
        ctrl.selectedIndex = 1;

        const ctrlData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(ctrlData[0]).toBeDefined();
        expect(ctrlData[0][EnumPropName.Color]).toBeDefined();
        expect(ctrlData[0][EnumPropName.Color].r).toBe(255);
        expect(ctrlData[0][EnumPropName.Color].g).toBe(0);

        // step 3: 在 state1 把节点改成 BLUE
        selectNode.color = ccLocal.color(0, 0, 255, 255);

        // step 4: 切回 state0 → 应触发 commit diff for state1; 然后 apply state0 的 RED
        ctrl.selectedIndex = 0;

        const ctrlDataNow = (select as any)._ctrlData[ctrl.ctrlId];
        expect(ctrlDataNow[1]).toBeDefined();
        expect(ctrlDataNow[1][EnumPropName.Color]).toBeDefined();
        expect(ctrlDataNow[1][EnumPropName.Color].b).toBe(255);

        // 切回 state0 后, 节点应 apply RED (现有 updateState 链路保证)
        expect(selectNode.color.r).toBe(255);
        expect(selectNode.color.b).toBe(0);

        ctrl.stopRecording();
    });

    it("录制结束时 stopRecording 也 commit final diff", () => {
        const { ctrl, select, selectNode } = setup();
        const ccLocal = (globalThis as any).cc;

        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.Position, true);
        selectNode.position = ccLocal.v3(0, 0, 0);

        ctrl.startRecording();

        // 改 position, 不切 state, 直接 stop
        selectNode.position = ccLocal.v3(100, 200, 0);
        ctrl.stopRecording();

        const ctrlData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(ctrlData[0][EnumPropName.Position]).toBeDefined();
        expect(ctrlData[0][EnumPropName.Position].x).toBe(100);
        expect(ctrlData[0][EnumPropName.Position].y).toBe(200);
    });
});
