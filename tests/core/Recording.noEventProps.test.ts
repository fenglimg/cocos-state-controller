/**
 * 录制无 cc 事件的 prop (Wave 2 T12)
 *
 * 长期 bug (Topic 3 设计文档明示): cc.Node 只为 8 个 prop 派发事件
 *   (position/color/scale/size/anchor/active/rotation/spriteframe);
 * Button.interactable / Label.string / Widget.top 等没有事件, 旧路径无法录制。
 *
 * Wave 2 prefab diff 路径不依赖事件: 只要 prop 被 controlled, snapshot 拍下来,
 * 切 state / stop 时 diff 就能 commit。
 *
 * 本测试覆盖 3 个典型 no-event prop:
 *   - cc.Button.interactable (boolean)
 *   - cc.Label.string (string)
 *   - cc.Widget.top (number)
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

function setup(attachComp?: (node: any) => any) {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    // 组件挂载必须早于 StateSelect.__preload (以便 PropertyControlService 识别)
    if (attachComp) attachComp(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();

    (ctrl as any).markCacheDirty();

    return { root, ctrl, select, selectNode };
}

describe("Recording no-event props (Wave 2 T12 long-standing bug fix)", () => {
    it("Button.interactable: 录制中切 state, fromState 应 commit interactable", () => {
        const ccLocal = (globalThis as any).cc;
        const { ctrl, select, selectNode } = setup((n) => n.addComponent(ccLocal.Button));

        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.ButtonInteractable, true);
        const btn = selectNode.getComponent(ccLocal.Button);
        btn.interactable = true;

        ctrl.startRecording();
        btn.interactable = false; // 改成 false (无 cc 事件触发)
        ctrl.selectedIndex = 1;   // 切 state → 应 commit false 到 state0
        ctrl.stopRecording();

        const ctrlData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(ctrlData[0]).toBeDefined();
        expect(ctrlData[0][EnumPropName.ButtonInteractable]).toBe(false);
    });

    it("Label.string: 录制中切 state, fromState 应 commit string", () => {
        const ccLocal = (globalThis as any).cc;
        const { ctrl, select, selectNode } = setup((n) => n.addComponent(ccLocal.Label));

        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.LabelString, true);
        const lbl = selectNode.getComponent(ccLocal.Label);
        lbl.string = "init";

        ctrl.startRecording();
        lbl.string = "recorded"; // 无 cc 事件
        ctrl.selectedIndex = 1;
        ctrl.stopRecording();

        const ctrlData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(ctrlData[0][EnumPropName.LabelString]).toBe("recorded");
    });

    it("Widget.top: 录制中改 number 字段, stopRecording 时 commit", () => {
        const ccLocal = (globalThis as any).cc;
        const { ctrl, select, selectNode } = setup((n) => n.addComponent(ccLocal.Widget));

        ctrl.selectedIndex = 0;
        select.togglePropertyControl(EnumPropName.WidgetTop, true);
        const w = selectNode.getComponent(ccLocal.Widget);
        w.top = 5;

        ctrl.startRecording();
        w.top = 99; // 无 cc 事件
        ctrl.stopRecording();

        const ctrlData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(ctrlData[0][EnumPropName.WidgetTop]).toBe(99);
    });
});
