/**
 * Round2 #S5 + #S8 核验.
 * S5: 删除选中 state 后, selectedIndex 应落在补位的相邻 state, 不应多减一位。
 * S8: 对**当前 state**做局部值操作(swap/copy/move)后, 节点显示值应同步刷新(否则 inspector 脱节)。
 */
declare global { const CC_EDITOR: boolean; const cc: any; const Editor: any; }
beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = { log:()=>{},warn:()=>{},error:()=>{}, Utils:{refreshSelectedInspector:()=>{}} };
});
const { StateController, StateValue } = require("../../assets/script/controller/StateController");
const { StateSelect } = require("../../assets/script/controller/StateSelect");
const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass; const property = ccL._decorator.property;
@ccclass("S58Fixture") class S58Fixture extends ccL.Component { @property() public heat = 0; }
const REF = "S58Fixture.heat";

function setup(n=3) {
    const root = new ccL.Node("S58_Root");
    const ctrlNode = new ccL.Node("S58_Ctrl"); root.addChild(ctrlNode);
    const selNode = new ccL.Node("S58_Sel"); ctrlNode.addChild(selNode);
    const ctrl = ctrlNode.addComponent(StateController); (ctrl as any).__preload();
    const fixture = selNode.addComponent(S58Fixture);
    const select = selNode.addComponent(StateSelect); (select as any).__preload();
    (ctrl as any).markCacheDirty();
    while ((ctrl as any)._states.length < n) {
        const ns = (ctrl as any)._states.slice(); ns.push(StateValue.create("S"+ns.length,(ctrl as any).stateIdAuto++)); ctrl.states = ns;
    }
    return { ctrl, select, fixture };
}

// #S5: 用户裁定"删选中 state 后选下一个(补位的)"。修双重调整(states setter <= → <)。
describe("#S5 删选中 state 后选'补位的下一个'", () => {
    it("[A,B,C] 选中 1 删除 → index=1 (补位的 C)", () => {
        const { ctrl } = setup(3);
        ctrl.selectedIndex = 1;
        ctrl.deleteCurrentState = true;
        expect(ctrl.states.length).toBe(2);
        expect(ctrl.selectedIndex).toBe(1);
    });
    it("[A,B,C] 选中 0 删除 → index=0 (补位的 B)", () => {
        const { ctrl } = setup(3);
        ctrl.selectedIndex = 0;
        ctrl.deleteCurrentState = true;
        expect(ctrl.selectedIndex).toBe(0);
    });
    it("[A,B,C] 选中 2(末)删除 → index=1 (新末位 B)", () => {
        const { ctrl } = setup(3);
        ctrl.selectedIndex = 2;
        ctrl.deleteCurrentState = true;
        expect(ctrl.selectedIndex).toBe(1);
    });
});

describe("#S8 局部值操作后当前 state 节点同步", () => {
    it("swapStateValues 涉及当前 state → 节点显示值刷新", () => {
        const { ctrl, select, fixture } = setup(2);
        const cid = ctrl.ctrlId;
        (select as any).getPropData(0, cid)[REF] = 10;
        (select as any).getPropData(1, cid)[REF] = 20;
        ctrl.selectedIndex = 1;          // 节点显示 20
        expect(fixture.heat).toBe(20);
        select.swapStateValues(0, 1, cid); // 现在 state1 = 10
        expect(fixture.heat).toBe(10);     // 当前 state 值变了 → 节点应同步
    });
});
export {};
