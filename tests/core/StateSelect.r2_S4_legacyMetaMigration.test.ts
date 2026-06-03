/**
 * Round2 #S4 (NA-8): migrateLegacyCtrlData 跳过 $$ 元桶 → $$controlledProps$$ 留数字 key →
 * 配合 C6 apply 门控, 迁移后的 propRef 值因 controlledProps 仍是数字 key 而被 skip → 老 .fire 加载后 apply 断 (回归).
 * 修复: 迁移时把 $$controlledProps$$ 内的数字 key (及聚合) 一并迁成 propRef string key。
 */
declare global { const CC_EDITOR: boolean; const cc: any; const Editor: any; }
beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = { log:()=>{},warn:()=>{},error:()=>{}, Utils:{refreshSelectedInspector:()=>{}} };
});
const { StateController } = require("../../assets/script/controller/StateController");
const { StateSelect } = require("../../assets/script/controller/StateSelect");
const { EnumPropName } = require("../../assets/script/controller/StateEnum");
const ccL = (globalThis as any).cc;

function setup() {
    const root = new ccL.Node("S4_Root");
    const ctrlNode = new ccL.Node("S4_Ctrl"); root.addChild(ctrlNode);
    const selNode = new ccL.Node("S4_Sel"); ctrlNode.addChild(selNode);
    const ctrl = ctrlNode.addComponent(StateController); (ctrl as any).__preload();
    const select = selNode.addComponent(StateSelect); (select as any).__preload();
    (ctrl as any).markCacheDirty();
    return { ctrl, select };
}

describe("#S4 迁移老 .fire 的 $$controlledProps$$ 数字 key → propRef", () => {
    it("controlledProps 内数字 key (Active=1/Color=10) 迁成 cc.Node.active/color", () => {
        const { ctrl, select } = setup();
        const cid = ctrl.ctrlId;
        // 模拟老 .fire: 数字 key 数据 + controlledProps 数字 key
        (select as any)._ctrlData[cid][1] = {
            [EnumPropName.Active]: true,
            [EnumPropName.Color]: "stub",
            $$controlledProps$$: { [EnumPropName.Active]: EnumPropName.Active, [EnumPropName.Color]: EnumPropName.Color },
        };

        (select as any).migrateLegacyCtrlData();

        const cp = (select as any)._ctrlData[cid][1].$$controlledProps$$;
        // 迁成 string propRef key
        expect(cp["cc.Node.active"]).not.toBeUndefined();
        expect(cp["cc.Node.color"]).not.toBeUndefined();
        // 旧数字 key 清掉
        expect(cp[EnumPropName.Active]).toBeUndefined();
        expect(cp[EnumPropName.Color]).toBeUndefined();
    });
});
export {};
