/**
 * 聚合 API 根治 (C1/C2/C7 + U1/U2/U3/U6): 聚合 EnumPropName (Position/Scale/Size/Euler/Anchor) 的
 * togglePropertyControl 拆成子项操作 —— 与 auto-opt "聚合不接入、子项独立" 一致 (用户本意: x/y/z 单独控制)。
 *
 *   - 接入聚合 = 接入各子项 (controlledProps 记子项 ref, 不记聚合 'cc.Node.position');
 *   - 取消聚合 = 释放各子项;
 *   - isPropertyControlled(聚合) = 全部子项受控才 true (部分受控的 ◐ 视觉属专项B, 本测试只验布尔基线)。
 */
declare global { const CC_EDITOR: boolean; const cc: any; const Editor: any; }
beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = { log:()=>{},warn:()=>{},error:()=>{}, Utils:{refreshSelectedInspector:()=>{}} };
});
const { StateControllerV2 } = require("../../assets/script/controller/StateControllerV2");
const { StateSelectV2 } = require("../../assets/script/controller/StateSelectV2");
const { EnumPropName } = require("../../assets/script/controller/StateEnumV2");
const ccL = (globalThis as any).cc;

function setup() {
    const root = new ccL.Node("AD_Root"); const cn = new ccL.Node("AD_Ctrl"); root.addChild(cn);
    const sn = new ccL.Node("AD_Sel"); cn.addChild(sn);
    const ctrl = cn.addComponent(StateControllerV2); (ctrl as any).__preload();
    const select = sn.addComponent(StateSelectV2); (select as any).__preload(); (ctrl as any).markCacheDirty();
    return { ctrl, select };
}

function cprops(select: any, ctrl: any) {
    return (select as any).getPropData(0, ctrl.ctrlId).$$controlledProps$$ || {};
}

describe("聚合 toggle 拆子项", () => {
    it("auto-opt 后 isPropertyControlled(Position)=true(子项全受控), 且 controlledProps 无聚合 key", () => {
        const { ctrl, select } = setup();
        expect(select.isPropertyControlledByPropRef("cc.Node.x")).toBe(true);
        expect(select.isPropertyControlled(EnumPropName.Position)).toBe(true); // C1: 不再恒 false
        expect(cprops(select, ctrl)["cc.Node.position"]).toBeUndefined(); // 无聚合 key
    });

    it("toggle Position off → 释放子项 x/y/z, isPropertyControlled(Position)=false (C7)", () => {
        const { ctrl, select } = setup();
        select.togglePropertyControl(EnumPropName.Position, false);
        ctrl.selectedIndex = 0;
        expect(select.isPropertyControlledByPropRef("cc.Node.x")).toBe(false);
        expect(select.isPropertyControlledByPropRef("cc.Node.y")).toBe(false);
        expect(select.isPropertyControlled(EnumPropName.Position)).toBe(false);
        expect(cprops(select, ctrl)["cc.Node.position"]).toBeUndefined();
    });

    it("toggle Position on → 接入子项(非聚合 key), isPropertyControlled 子项与聚合均 true (U2/U3)", () => {
        const { ctrl, select } = setup();
        select.togglePropertyControl(EnumPropName.Position, false);
        select.togglePropertyControl(EnumPropName.Position, true);
        expect(select.isPropertyControlledByPropRef("cc.Node.x")).toBe(true);
        expect(cprops(select, ctrl)["cc.Node.x"]).not.toBeUndefined();
        expect(cprops(select, ctrl)["cc.Node.position"]).toBeUndefined(); // 仍不写聚合 key
        expect(select.isPropertyControlled(EnumPropName.Position)).toBe(true);
    });

    it("Scale 同理 (toggle off 释放 scaleX/Y/Z)", () => {
        const { ctrl, select } = setup();
        expect(select.isPropertyControlled(EnumPropName.Scale)).toBe(true);
        select.togglePropertyControl(EnumPropName.Scale, false);
        expect(select.isPropertyControlledByPropRef("cc.Node.scaleX")).toBe(false);
        expect(select.isPropertyControlled(EnumPropName.Scale)).toBe(false);
    });
});
export {};
