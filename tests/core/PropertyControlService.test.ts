/**
 * PropertyControlService 契约测试 (Phase 5.2)
 *
 * 三块:
 *   - isPropertyAvailable / isPropertyControlled / scanAvailableProperties 的静态调用
 *     (已被 StateSelectV2.publicApi + scanProps 间接覆盖, 这里 1-2 个 sanity check)
 *   - registerComponentProp 插件扩展点 — 主要契约: 注册后 isPropertyAvailable 识别新 prop,
 *     且 scanAvailableProperties 会列出该 prop (前提是 prop 数字值在 EnumPropName 范围内)
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {},
        warn: () => {},
        error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
    };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Mod = require("../../assets/script/controller/StatePropertyControlService");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnumV2");
// require StateSelectV2 一次, 触发 cc.Enum(EnumPropName) 副作用, 与运行时一致
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("../../assets/script/controller/StateSelectV2");

const { PropertyControlService } = Mod;
const { EnumPropName } = EnumMod;

describe("PropertyControlService static API sanity", () => {
    it("isPropertyAvailable: 节点 base 8 prop 恒为 true", () => {
        const ccL = (globalThis as any).cc;
        const node = new ccL.Node("PCS_Base");
        expect(PropertyControlService.isPropertyAvailable(node, EnumPropName.Active)).toBe(true);
        expect(PropertyControlService.isPropertyAvailable(node, EnumPropName.Opacity)).toBe(true);
    });

    it("isPropertyAvailable: 缺组件时 false, 加上组件后 true", () => {
        const ccL = (globalThis as any).cc;
        const node = new ccL.Node("PCS_Comp");
        expect(PropertyControlService.isPropertyAvailable(node, EnumPropName.LabelString)).toBe(false);
        node.addComponent(ccL.Label);
        expect(PropertyControlService.isPropertyAvailable(node, EnumPropName.LabelString)).toBe(true);
    });

    it("isPropertyControlled: propData = null 返回 false", () => {
        expect(PropertyControlService.isPropertyControlled(null, EnumPropName.Active)).toBe(false);
        expect(PropertyControlService.isPropertyControlled(undefined, EnumPropName.Active)).toBe(false);
    });

    it("isPropertyControlled: 通过 $$controlledProps$$ 标记识别受控", () => {
        const propData = { $$controlledProps$$: { Active: EnumPropName.Active } };
        expect(PropertyControlService.isPropertyControlled(propData, EnumPropName.Active)).toBe(true);
        expect(PropertyControlService.isPropertyControlled(propData, EnumPropName.Opacity)).toBe(false);
    });

    it("scanAvailableProperties: 空白节点列出 8 个 base prop", () => {
        const ccL = (globalThis as any).cc;
        const node = new ccL.Node("PCS_Scan");
        const list = PropertyControlService.scanAvailableProperties(node);
        expect(list.length).toBe(8);
        expect(list).toContain(EnumPropName.Active);
        expect(list).not.toContain(EnumPropName.Non);
    });
});

describe("PropertyControlService.registerComponentProp 插件扩展点", () => {
    /**
     * 用一个项目里存在但本服务**没注册**的占位 prop 做 round-trip 测试.
     * 选 EnumPropName.LabelString 是不行的, 它已被内置注册.
     * 这里用一个不存在的临时数字 propType (在 EnumPropName 范围外) 验证 register API,
     * 然后立即清掉以免污染其他测试.
     */

    const customPropType = 9999 as any;

    afterEach(() => {
        // 清掉测试注册, 避免污染
        const map = (PropertyControlService as any).componentAvailability as Map<any, any>;
        map.delete(customPropType);
    });

    it("注册前 isPropertyAvailable 对未知 prop 恒为 false", () => {
        const ccL = (globalThis as any).cc;
        const node = new ccL.Node("PCS_Reg1");
        node.addComponent(ccL.Toggle);
        expect(PropertyControlService.isPropertyAvailable(node, customPropType)).toBe(false);
    });

    it("注册后 isPropertyAvailable 按 check 函数判定", () => {
        const ccL = (globalThis as any).cc;
        const node = new ccL.Node("PCS_Reg2");

        // 注册: "如果节点挂了 cc.Toggle, 就认为可用"
        PropertyControlService.registerComponentProp(customPropType, (n: any) => !!n.getComponent(ccL.Toggle));

        expect(PropertyControlService.isPropertyAvailable(node, customPropType)).toBe(false);
        node.addComponent(ccL.Toggle);
        expect(PropertyControlService.isPropertyAvailable(node, customPropType)).toBe(true);
    });
});
