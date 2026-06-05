/**
 * Round3 T7/T9/T10 核验 (预期已绿 —— 已被前序修复覆盖, 作回归确认; 红则需补修):
 *  T7: 复制 state 后富类型(cc.Color)独立 (C5 deepClonePropData 已修)。
 *  T9: 同 ctrl 下 sibling StateSelect 排除隔离 (per-node _ctrlData)。
 *  T10: 删 state 值后切回, 节点取 default 兜底不 NaN (apply 路径)。
 */
declare global { const CC_EDITOR: boolean; const cc: any; const Editor: any; }
beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = { log:()=>{},warn:()=>{},error:()=>{}, Utils:{refreshSelectedInspector:()=>{}} };
});
const { StateController, StateValue } = require("../../assets/script/controller/StateControllerV2");
const { StateSelect } = require("../../assets/script/controller/StateSelectV2");
const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass; const property = ccL._decorator.property;
@ccclass("R3SafeFixture") class R3SafeFixture extends ccL.Component {
    @property(ccL.Color) public tint: cc.Color = ccL.Color.WHITE;
    @property() public heat = 0;
}

describe("#T7 复制 state 富类型独立", () => {
    it("updateStateCopy 后 cc.Color 改副本不污染源", () => {
        const root = new ccL.Node("R"); const cn = new ccL.Node("C"); root.addChild(cn);
        const sn = new ccL.Node("S"); cn.addChild(sn);
        const ctrl = cn.addComponent(StateController); (ctrl as any).__preload();
        sn.addComponent(R3SafeFixture);
        const sel = sn.addComponent(StateSelect); (sel as any).__preload(); (ctrl as any).markCacheDirty();
        const ns=(ctrl as any)._states.slice(); ns.push(StateValue.create("X",(ctrl as any).stateIdAuto++)); ctrl.states=ns;
        const cid = ctrl.ctrlId;
        (sel as any)._ctrlData[cid][0] = { "R3SafeFixture.tint": ccL.color(255,0,0,255) };
        (sel as any).updateStateCopy(ctrl, { fromIndex:0, toIndex:1 });
        (sel as any)._ctrlData[cid][1]["R3SafeFixture.tint"].r = 0;
        expect((sel as any)._ctrlData[cid][0]["R3SafeFixture.tint"].r).toBe(255);
    });
});

describe("#T9 sibling StateSelect 排除隔离", () => {
    it("ChildA 排除 cc.Node.active 不影响 ChildB", () => {
        const root = new ccL.Node("R9"); const cn = new ccL.Node("C9"); root.addChild(cn);
        const ctrl = cn.addComponent(StateController); (ctrl as any).__preload();
        const a = new ccL.Node("A9"); cn.addChild(a); const selA = a.addComponent(StateSelect); (selA as any).__preload();
        const b = new ccL.Node("B9"); cn.addChild(b); const selB = b.addComponent(StateSelect); (selB as any).__preload();
        (ctrl as any).markCacheDirty();
        selA.setPropExcluded("cc.Node.active", true);
        expect(selA.isPropertyControlledByPropRef("cc.Node.active")).toBe(false);
        // B 不受影响
        expect(selB.isPropertyControlledByPropRef("cc.Node.active")).toBe(true);
        expect((selB as any)._userExcludedProps.indexOf("cc.Node.active")).toBe(-1);
    });
});

describe("#T10 删值后 default 兜底", () => {
    it("state 删 cc.Node.opacity 值, 切回取 default 不 NaN", () => {
        const root = new ccL.Node("R10"); const cn = new ccL.Node("C10"); root.addChild(cn);
        const sn = new ccL.Node("S10"); cn.addChild(sn);
        const ctrl = cn.addComponent(StateController); (ctrl as any).__preload();
        const sel = sn.addComponent(StateSelect); (sel as any).__preload(); (ctrl as any).markCacheDirty();
        const ns=(ctrl as any)._states.slice(); ns.push(StateValue.create("X",(ctrl as any).stateIdAuto++)); ctrl.states=ns;
        const cid = ctrl.ctrlId;
        (sel as any).getDefaultData(cid)["cc.Node.opacity"] = 123;
        delete (sel as any).getPropData(0, cid)["cc.Node.opacity"];
        ctrl.selectedIndex = 1; ctrl.selectedIndex = 0; // 切走再切回 state0(无 opacity 值)
        expect(sn.opacity).toBe(123); // default 兜底
    });
});
export {};
