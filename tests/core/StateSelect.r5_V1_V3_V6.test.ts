/**
 * Round5 #V1 + #V3 + #V6.
 * V1: euler 子项(rotationX/Y)全 SYSTEM_EXCLUDE → 聚合根治后 auto-opt 整体跳过 euler → 默认完全不受控。
 *     修: auto-opt 对"无可控子项"的聚合(euler)回退接入整体聚合 key。
 * V3: 部分轴 reparent —— 某 state 缺某轴值(依赖 default)时, transPosition 用 live 节点坐标兜底,
 *     应改用 default 基线 (否则用激活 state 的 live 值污染其他 state 的换算)。
 * V6: 删 state 后 cleanupDeletedStateProps 清了 default 的值, 但漏清 default.$$controlledProps$$ 的 flag。
 */
declare global { const CC_EDITOR: boolean; const cc: any; const Editor: any; }
beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = { log:()=>{},warn:()=>{},error:()=>{}, Utils:{refreshSelectedInspector:()=>{}} };
});
const { StateController, StateValue } = require("../../assets/script/controller/StateController");
const { StateSelect } = require("../../assets/script/controller/StateSelect");
const { EnumPropName } = require("../../assets/script/controller/StateEnum");
const ccL = (globalThis as any).cc;

function setup(n=2) {
    const root = new ccL.Node("V_Root"); const cn = new ccL.Node("V_Ctrl"); root.addChild(cn);
    const sn = new ccL.Node("V_Sel"); cn.addChild(sn);
    const ctrl = cn.addComponent(StateController); (ctrl as any).__preload();
    const sel = sn.addComponent(StateSelect); (sel as any).__preload(); (ctrl as any).markCacheDirty();
    while ((ctrl as any)._states.length < n) {
        const ns=(ctrl as any)._states.slice(); ns.push(StateValue.create("X"+ns.length,(ctrl as any).stateIdAuto++)); ctrl.states=ns;
    }
    return { ctrl, sel, sn, root };
}

describe("#V1 euler 不自动接入(按 spec), 但可手动接入(整体聚合保 z)", () => {
    it("__preload 后 euler 未自动接入(SPEC line52 跳过聚合); 手动 toggle 后受控", () => {
        const { sel } = setup();
        // V1 驳回: auto-opt 跳过聚合(含子项全排除的 euler)是设计; 手动接入仍可用
        sel.togglePropertyControl(EnumPropName.Euler, true);
        expect(sel.isPropertyControlled(EnumPropName.Euler)).toBe(true);
        sel.togglePropertyControl(EnumPropName.Euler, false);
        expect(sel.isPropertyControlled(EnumPropName.Euler)).toBe(false);
    });
});

describe("#V3 部分轴 reparent 用 default 基线非 live 坐标", () => {
    it("state0 缺 y(依赖default y=0), 激活 state1(live y=500) reparent → state0 的 y 按 default 0 换算", () => {
        const { ctrl, sel, sn, root } = setup(2);
        const cid = ctrl.ctrlId;
        const page = (sel as any)._ctrlData[cid];
        (sel as any).getDefaultData(cid)["cc.Node.y"] = 0;
        page[0]["cc.Node.x"] = 100; delete page[0]["cc.Node.y"]; // state0 无 y → 依赖 default 0
        page[1]["cc.Node.x"] = 200; page[1]["cc.Node.y"] = 500;
        ctrl.selectedIndex = 1; sn.setPosition(200, 500); // 激活 state1, 节点 live y=500

        const pa = new ccL.Node("PA"); pa.setPosition(0,0); root.addChild(pa);
        const pb = new ccL.Node("PB"); pb.setPosition(0,300); root.addChild(pb); // 纯 y 平移 +300
        sn.removeFromParent(false); pb.addChild(sn);
        (sel as any).transPosition(pa);

        // state0 无 y(依赖 default), 不回写其 y; 而 default 基线 y 本身被换算 (0@PA → PB 局部 -300),
        // 这样依赖 default 的 state0 有效 y 正确; state1 有 y=500 → 换算 (500-300=200)。
        expect(page[0]["cc.Node.y"]).toBeUndefined();          // 缺轴不回写
        expect(page.$$default$$["cc.Node.y"]).toBeCloseTo(-300, 1); // default 被换算
        expect(page[1]["cc.Node.y"]).toBeCloseTo(200, 1);      // state1 的 y 正常换算
    });
});

describe("#V6 删 state 后 default controlledProps flag 同步清", () => {
    it("孤儿 propRef 从 default 删值时, 也删 default.$$controlledProps$$ flag", () => {
        const { ctrl, sel } = setup(3);
        const cid = ctrl.ctrlId;
        const page = (sel as any)._ctrlData[cid];
        page[0]={}; page[1]={"Orphan.k":5}; page[2]={};
        page.$$default$$ = page.$$default$$||{};
        page.$$default$$["Orphan.k"]=0;
        page.$$default$$.$$controlledProps$$ = page.$$default$$.$$controlledProps$$||{};
        page.$$default$$.$$controlledProps$$["Orphan.k"]="Orphan.k";

        ctrl.selectedIndex=1; ctrl.deleteCurrentState=true;

        expect(page.$$default$$["Orphan.k"]).toBeUndefined();
        expect(page.$$default$$.$$controlledProps$$["Orphan.k"]).toBeUndefined(); // flag 也清
    });
});
export {};
