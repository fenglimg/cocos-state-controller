/**
 * Round4 #U5 + #U8.
 * U5: migrateLegacyCtrlData 把 $$propertyData$$ 内 number/custom key 迁成 string 后, 应合并到顶层 propData
 *     (否则 applyPropRefKeysToNode 只读顶层 → 老 .fire 的 $$propertyData$$ 值永不 apply)。
 * U8: 节点失效时 updateState 应优雅早退, 不继续调 applyPropRefKeysToNode 刷警告。
 */
declare global { const CC_EDITOR: boolean; const cc: any; const Editor: any; }
beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = { log:()=>{},warn:()=>{},error:()=>{}, Utils:{refreshSelectedInspector:()=>{}} };
});
const { StateController } = require("../../assets/script/controller/StateControllerV2");
const { StateSelect } = require("../../assets/script/controller/StateSelectV2");
const { EnumPropName } = require("../../assets/script/controller/StateEnumV2");
const ccL = (globalThis as any).cc;

function setup() {
    const root = new ccL.Node("U_Root"); const cn = new ccL.Node("U_Ctrl"); root.addChild(cn);
    const sn = new ccL.Node("U_Sel"); cn.addChild(sn);
    const ctrl = cn.addComponent(StateController); (ctrl as any).__preload();
    const select = sn.addComponent(StateSelect); (select as any).__preload(); (ctrl as any).markCacheDirty();
    return { ctrl, select };
}

describe("#U5 迁移 $$propertyData$$ 合并到顶层", () => {
    it("$$propertyData$$ 内 number/custom key 迁移后出现在顶层 propData", () => {
        const { ctrl, select } = setup();
        const cid = ctrl.ctrlId;
        (select as any)._ctrlData[cid][1] = {
            $$propertyData$$: { [EnumPropName.Active]: true, "MyComp.heat": 5 },
            $$controlledProps$$: {},
        };
        (select as any).migrateLegacyCtrlData();
        const s1 = (select as any)._ctrlData[cid][1];
        expect(s1["cc.Node.active"]).toBe(true); // Active number key 迁 string 并提到顶层
        expect(s1["MyComp.heat"]).toBe(5);        // 自定义 string key 提到顶层
    });
});

describe("#U8 失效节点 updateState 优雅早退", () => {
    it("node 失效时 updateState 不抛, 不调 applyPropRefKeysToNode", () => {
        const { ctrl, select } = setup();
        const spy = jest.spyOn(select as any, "applyPropRefKeysToNode");
        (select as any).node = null; // 模拟节点失效
        expect(() => (select as any).updateState(ctrl)).not.toThrow();
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
export {};
