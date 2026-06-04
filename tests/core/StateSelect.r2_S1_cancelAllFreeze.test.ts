/**
 * Round2 #S1: 取消最后一个受控 prop 后 controlledProps={} → 我的 C6 门控回退"apply all" → 全解冻 (回归).
 * 根因: applyPropRefKeysToNode 的 hasControlledInfo = Object.keys(cprops).length>0; 全取消后 {} → false →
 *       退回 apply all。应区分"controlledProps 缺失(老.fire 无元)=apply all" vs "存在但空(全取消)=apply nothing"。
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
@ccclass("S1Fixture") class S1Fixture extends ccL.Component { @property() public heat = 0; }
const REF = "S1Fixture.heat";

function setup() {
    const root = new ccL.Node("S1_Root");
    const ctrlNode = new ccL.Node("S1_Ctrl"); root.addChild(ctrlNode);
    const selNode = new ccL.Node("S1_Sel"); ctrlNode.addChild(selNode);
    const ctrl = ctrlNode.addComponent(StateControllerV2); (ctrl as any).__preload();
    const fixture = selNode.addComponent(S1Fixture);
    const select = selNode.addComponent(StateSelectV2); (select as any).__preload();
    (ctrl as any).markCacheDirty();
    if ((ctrl as any)._states.length < 2) {
        const SV = (ctrl as any)._states[0].constructor;
        const ns = (ctrl as any)._states.slice(); ns.push(SV.create("S1b",(ctrl as any).stateIdAuto++)); ctrl.states = ns;
    }
    return { ctrl, select, fixture };
}

describe("#S1 取消全部受控后仍冻结(controlledProps={} 不该 apply all)", () => {
    it("controlledProps 存在但空 → apply 不写回残留值(冻结)", () => {
        const { ctrl, select, fixture } = setup();
        const cid = ctrl.ctrlId;
        for (const i of [0, 1]) {
            const pd = (select as any).getPropData(i, cid);
            pd.$$controlledProps$$ = {};        // 全取消
            pd[REF] = 999;                       // 残留值
        }
        const dd = (select as any).getDefaultData(cid);
        dd.$$controlledProps$$ = {};
        dd[REF] = 10;
        fixture.heat = 5;                        // 当前值(冻结目标)
        ctrl.selectedIndex = 1;                  // 切 state → apply
        expect(fixture.heat).toBe(5);            // 冻结: 不被拽成 999/10
    });
});
export {};
