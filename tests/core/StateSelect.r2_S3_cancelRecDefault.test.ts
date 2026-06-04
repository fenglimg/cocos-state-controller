/**
 * Round2 #S3: cancelRecording 把 _initialSnapshot 值硬写进 propData, 即使该 state 原本"无该 key、依赖 default"。
 * → 切断动态 default 兜底 (附录A #1): 之后改 default 该 state 不再跟随。
 * 期望: cancelRecording 只回滚"录制前 propData 里本就存在的 key", 不为"依赖 default 的 key"新建硬编码值。
 */
declare global { const CC_EDITOR: boolean; const cc: any; const Editor: any; }
beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = { log:()=>{},warn:()=>{},error:()=>{}, Utils:{refreshSelectedInspector:()=>{}} };
});
const { StateControllerV2 } = require("../../assets/script/controller/StateControllerV2");
const { StateSelectV2 } = require("../../assets/script/controller/StateSelectV2");
const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass; const property = ccL._decorator.property;
@ccclass("S3Fixture") class S3Fixture extends ccL.Component { @property() public heat = 0; }
const REF = "S3Fixture.heat";

function setup() {
    const root = new ccL.Node("S3_Root");
    const ctrlNode = new ccL.Node("S3_Ctrl"); root.addChild(ctrlNode);
    const selNode = new ccL.Node("S3_Sel"); ctrlNode.addChild(selNode);
    const ctrl = ctrlNode.addComponent(StateControllerV2); (ctrl as any).__preload();
    const fixture = selNode.addComponent(S3Fixture);
    const select = selNode.addComponent(StateSelectV2); (select as any).__preload();
    (ctrl as any).markCacheDirty();
    const SV = (ctrl as any)._states[0].constructor;
    while ((ctrl as any)._states.length < 2) {
        const ns = (ctrl as any)._states.slice(); ns.push(SV.create("S3b",(ctrl as any).stateIdAuto++)); ctrl.states = ns;
    }
    return { ctrl, select, fixture };
}

describe("#S3 cancelRecording 不硬编码依赖 default 的 key", () => {
    it("state 依赖 default 的 prop, 录制后取消 → propData 仍无该 key(保持动态兜底)", () => {
        const { ctrl, select, fixture } = setup();
        const cid = ctrl.ctrlId;
        // default.heat=10; state1 删掉自己的 heat(依赖 default)
        (select as any).getDefaultData(cid)[REF] = 10;
        const pd1 = (select as any).getPropData(1, cid);
        delete pd1[REF];

        ctrl.selectedIndex = 1;
        ctrl.startRecording();
        fixture.heat = 20;                 // 录制中改值
        (ctrl as any).cancelRecording();

        // 取消后 state1 不应凭空多出硬编码 heat —— 仍依赖 default(动态兜底)
        expect((select as any).getPropData(1, cid)[REF]).toBeUndefined();
    });
});
export {};
