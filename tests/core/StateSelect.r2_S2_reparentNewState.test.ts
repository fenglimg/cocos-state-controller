/**
 * Round2 #S2: reparent 换算依赖**当前激活 state** 的受控判定 (isAxisConvertible→isPropertyControlled→
 * getPropData(当前 selectedIndex))。若激活的是新加的空 state(无 controlledProps), 则全轴判不受控 →
 * transPosition 整体跳过 → 其他 state 存的位置不被换算 (附录A #3 违反)。
 * 修复: reparent 受控判定按全局(default controlledProps), 不依赖激活 state。
 */
declare global { const CC_EDITOR: boolean; const cc: any; const Editor: any; }
beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = { log:()=>{},warn:()=>{},error:()=>{}, Utils:{refreshSelectedInspector:()=>{}} };
});
const { StateController } = require("../../assets/script/controller/StateControllerV2");
const { StateSelect } = require("../../assets/script/controller/StateSelectV2");
const ccL = (globalThis as any).cc;

function setup() {
    const root = new ccL.Node("S2_Root");
    const ctrlNode = new ccL.Node("S2_Ctrl"); root.addChild(ctrlNode);
    const selNode = new ccL.Node("S2_Sel"); ctrlNode.addChild(selNode);
    const ctrl = ctrlNode.addComponent(StateController); (ctrl as any).__preload();
    const select = selNode.addComponent(StateSelect); (select as any).__preload();
    (ctrl as any).markCacheDirty();
    return { ctrl, select, selNode, root };
}

describe("#S2 reparent 不应被激活的空 state 干扰", () => {
    it("激活新加空 state 时 reparent, 其他 state 的位置仍被换算", () => {
        const { ctrl, select, selNode, root } = setup();
        const cid = ctrl.ctrlId;
        // state0 存了位置 (auto-opt 控 x/y/z)
        (select as any).getPropData(0, cid)["cc.Node.x"] = 100;
        expect(select.isPropertyControlledByPropRef("cc.Node.x")).toBe(true);

        // 加 state 2 (空, 无 controlledProps), 切为激活
        const SV = (ctrl as any)._states[0].constructor;
        const ns = (ctrl as any)._states.slice();
        ns.push(SV.create("S2b", (ctrl as any).stateIdAuto++));
        ctrl.states = ns;
        ctrl.selectedIndex = ns.length - 1; // 激活新空 state

        const pa = new ccL.Node("PA"); pa.setPosition(0,0); root.addChild(pa);
        const pb = new ccL.Node("PB"); pb.setPosition(300,0); root.addChild(pb);
        selNode.removeFromParent(false); pb.addChild(selNode);
        (select as any).transPosition(pa);

        // state0 的 x 应被换算 (100@PA → PB 局部 -200), 而非因激活空 state 被整体跳过
        expect((select as any).getPropData(0, cid)["cc.Node.x"]).toBeCloseTo(-200, 1);
    });
});
export {};
