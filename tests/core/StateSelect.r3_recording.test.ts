/**
 * Round3 #T3 + #T4: 录制中途接入/排除 prop 的正确性.
 * T3: 录制中 togglePropertyControl(propRef,true) 后改值 → stop 应提交(当前丢失, _snapshot 未含新 key)。
 * T4: 录制中 setPropExcluded(propRef,true) 后改值 → stop 不应提交(当前违反不变量#8, commitRecordingDiff 无排除过滤)。
 */
declare global { const CC_EDITOR: boolean; const cc: any; const Editor: any; }
beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = { log:()=>{},warn:()=>{},error:()=>{}, Utils:{refreshSelectedInspector:()=>{}} };
});
const { StateController } = require("../../assets/script/controller/StateControllerV2");
const { StateSelect } = require("../../assets/script/controller/StateSelectV2");
const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass; const property = ccL._decorator.property;
@ccclass("R3RecFixture") class R3RecFixture extends ccL.Component { @property() public value = 0; }
const CREF = "R3RecFixture.value";

function setup() {
    const root = new ccL.Node("R3R_Root");
    const ctrlNode = new ccL.Node("R3R_Ctrl"); root.addChild(ctrlNode);
    const selNode = new ccL.Node("R3R_Sel"); ctrlNode.addChild(selNode);
    const ctrl = ctrlNode.addComponent(StateController); (ctrl as any).__preload();
    const fixture = selNode.addComponent(R3RecFixture);
    const select = selNode.addComponent(StateSelect); (select as any).__preload();
    (ctrl as any).markCacheDirty();
    return { ctrl, select, selNode, fixture };
}

describe("#T3 录制中接入新 prop 改值应提交", () => {
    it("startRecording → 取消接入再接入(模拟录制中接入)→ 改值 → stop → 已提交", () => {
        const { ctrl, select, fixture } = setup();
        const cid = ctrl.ctrlId;
        // 录制前 value 未接入(先 opt-out 模拟"录制开始时未控")
        select.togglePropertyControl(CREF, false);
        expect(select.isPropertyControlledByPropRef(CREF)).toBe(false);

        ctrl.selectedIndex = 0;
        ctrl.startRecording();
        // 录制中接入 + 改值
        select.togglePropertyControl(CREF, true);
        fixture.value = 100;
        ctrl.stopRecording();

        expect((select as any).getPropData(0, cid)[CREF]).toBe(100);
    });
});

describe("#T4 录制中排除 prop 不应提交(不变量#8)", () => {
    it("startRecording → setPropExcluded → 改值 → stop → ctrlData 不含该改动", () => {
        const { ctrl, select, fixture } = setup();
        const cid = ctrl.ctrlId;
        // value 受控, baseline=0
        (select as any).getPropData(0, cid)[CREF] = 0;
        fixture.value = 0;
        ctrl.selectedIndex = 0;
        ctrl.startRecording();
        select.setPropExcluded(CREF, true);  // 录制中排除
        fixture.value = 999;                  // 改排除后的 prop
        ctrl.stopRecording();

        // 不变量#8: 排除的 prop 不被录制写回
        expect((select as any).getPropData(0, cid)[CREF]).not.toBe(999);
    });
});
export {};
