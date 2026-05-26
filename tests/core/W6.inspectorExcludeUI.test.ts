/**
 * W6-4 红测试: inspector 排除清单 UI 字段契约
 *
 * 验证 StateSelect 新增的 3 个 inspector @property + refreshExcludeEnumLists 私有方法:
 *   - excludedPropsDisplay (string[] readonly): 返回 SYSTEM_EXCLUDE + _userExcludedProps union
 *   - addExcludeTrigger (string setter): 收到 propRef 时 push 到 _userExcludedProps + 该 prop 从跟随中移除
 *   - removeExcludeTrigger (string setter): 收到 propRef 时从 _userExcludedProps 移除
 *   - refreshExcludeEnumLists(): 用 setClassAttr 注入 add/remove 的 enumList
 *
 * 不 mock cc, 走真 cocos 引擎集成测试.
 *
 * 红预期: 当前 StateSelect 无这 3 个新字段 / refreshExcludeEnumLists 方法, 全红.
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {}, warn: () => {}, error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
    };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ControllerMod = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelect");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IntrospectionMod = require("../../assets/script/controller/PrefabIntrospection");

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;
const { SYSTEM_EXCLUDE } = IntrospectionMod;

// 自定义 @ccclass fixture: 用于覆盖 inspector 排除新增 prop 的下拉过滤
const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

@ccclass("W6_ExcludeFixture")
class W6_ExcludeFixture extends ccL.Component {
    @property() public heatLevel: number = 0;
    @property() public label: string = "foo";
}

function setup() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    selectNode.addComponent(W6_ExcludeFixture);

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ctrl, select, selectNode };
}

describe("W6-4 inspector 排除清单 UI", () => {
    it("excludedPropsDisplay getter 默认返回 SYSTEM_EXCLUDE (用户未加排除时)", () => {
        const { select } = setup();
        const display = (select as any).excludedPropsDisplay;
        expect(Array.isArray(display)).toBe(true);
        // SYSTEM_EXCLUDE 6 项必含
        for (const ex of SYSTEM_EXCLUDE) {
            expect(display).toContain(ex);
        }
        // 默认 _userExcludedProps 为空, 不应额外项
        expect(display.length).toBe(SYSTEM_EXCLUDE.length);
    });

    it("excludedPropsDisplay getter 返回 SYSTEM_EXCLUDE + _userExcludedProps union", () => {
        const { select } = setup();
        (select as any)._userExcludedProps = ["W6_ExcludeFixture.heatLevel", "W6_ExcludeFixture.label"];
        const display = (select as any).excludedPropsDisplay;
        // 含 SYSTEM_EXCLUDE
        for (const ex of SYSTEM_EXCLUDE) {
            expect(display).toContain(ex);
        }
        // 含用户加的
        expect(display).toContain("W6_ExcludeFixture.heatLevel");
        expect(display).toContain("W6_ExcludeFixture.label");
        expect(display.length).toBe(SYSTEM_EXCLUDE.length + 2);
    });

    it("addExcludeTrigger setter 收到下拉 index 时, push 到 _userExcludedProps 且该 prop 从跟随中移除", () => {
        const { select } = setup();
        // 前置: __preload 自动接入 W6_ExcludeFixture.heatLevel
        expect((select as any).isPropertyControlledByPropRef("W6_ExcludeFixture.heatLevel")).toBe(true);
        // 找 heatLevel 在 _addExcludeOptions 中的 index (refreshExcludeEnumLists 已在 __preload 同步过)
        const options: string[] = (select as any)._addExcludeOptions;
        const idx = options.indexOf("W6_ExcludeFixture.heatLevel");
        expect(idx).toBeGreaterThanOrEqual(0);

        (select as any).addExcludeTrigger = idx;

        expect((select as any)._userExcludedProps).toContain("W6_ExcludeFixture.heatLevel");
        // 跟随中已移除
        expect((select as any).isPropertyControlledByPropRef("W6_ExcludeFixture.heatLevel")).toBe(false);
    });

    it("addExcludeTrigger setter 收到非法值时 noop", () => {
        const { select } = setup();
        const before = [...((select as any)._userExcludedProps || [])];

        // 越界 index
        (select as any).addExcludeTrigger = 99999;
        expect((select as any)._userExcludedProps).toEqual(before);

        // 非数字
        (select as any).addExcludeTrigger = NaN;
        expect((select as any)._userExcludedProps).toEqual(before);
    });

    it("removeExcludeTrigger setter 收到下拉 index 时, 从 _userExcludedProps 移除", () => {
        const { select } = setup();
        (select as any)._userExcludedProps = ["W6_ExcludeFixture.heatLevel", "W6_ExcludeFixture.label"];
        (select as any).refreshExcludeEnumLists();
        const options: string[] = (select as any)._removeExcludeOptions;
        const idx = options.indexOf("W6_ExcludeFixture.heatLevel");
        expect(idx).toBeGreaterThanOrEqual(0);

        (select as any).removeExcludeTrigger = idx;

        expect((select as any)._userExcludedProps).not.toContain("W6_ExcludeFixture.heatLevel");
        expect((select as any)._userExcludedProps).toContain("W6_ExcludeFixture.label");
    });

    it("removeExcludeTrigger setter 收到越界 index 时 noop", () => {
        const { select } = setup();
        (select as any)._userExcludedProps = ["W6_ExcludeFixture.heatLevel"];
        (select as any).refreshExcludeEnumLists();
        (select as any).removeExcludeTrigger = 99999;
        expect((select as any)._userExcludedProps).toEqual(["W6_ExcludeFixture.heatLevel"]);
    });

    it("refreshExcludeEnumLists: addExcludeTrigger.enumList = 当前跟随中, 不含已排除", () => {
        const { select } = setup();
        // refreshExcludeEnumLists 在 __preload 末尾应被调用过.
        // 注意: cocos 2.x setClassAttr(instance, ...) 走 instance.__attrs__ proto-chain 路径
        // (参考 updateCtrlName 处的同款套路), 所以读 enumList 要走 instance 的 attrs.
        const attrs = ccL.Class.Attr.getClassAttrs(select);
        const addEnumList = attrs["addExcludeTrigger$_$enumList"];
        expect(Array.isArray(addEnumList)).toBe(true);
        // cocos 2.x enum 下拉项 value 是 number index, name 是 propRef
        const addNames = addEnumList.map((e: any) => e.name);
        expect(addNames).toContain("W6_ExcludeFixture.heatLevel");
        for (const ex of SYSTEM_EXCLUDE) {
            expect(addNames).not.toContain(ex);
        }
    });

    it("refreshExcludeEnumLists: removeExcludeTrigger.enumList = _userExcludedProps", () => {
        const { select } = setup();
        (select as any)._userExcludedProps = ["W6_ExcludeFixture.heatLevel"];
        // 主动触发 refresh
        if (typeof (select as any).refreshExcludeEnumLists === "function") {
            (select as any).refreshExcludeEnumLists();
        }

        const attrs = ccL.Class.Attr.getClassAttrs(select);
        const removeEnumList = attrs["removeExcludeTrigger$_$enumList"];
        expect(Array.isArray(removeEnumList)).toBe(true);
        const removeNames = removeEnumList.map((e: any) => e.name);
        expect(removeNames).toContain("W6_ExcludeFixture.heatLevel");
        for (const ex of SYSTEM_EXCLUDE) {
            expect(removeNames).not.toContain(ex);
        }
    });

    it("旧 3 props 组 @property visible:false (inspector 视觉隐藏, ts 字段保留)", () => {
        // 注意: 这是契约测试 — c3 才真删 props/*, W6-4 仅视觉隐藏
        const ctor = StateSelect;
        const attrs = ccL.Class.Attr.getClassAttrs(ctor);
        // 三个旧分组字段的 visible 属性应为 false
        expect(attrs["nodeProps$_$visible"]).toBe(false);
        expect(attrs["componentProps$_$visible"]).toBe(false);
        expect(attrs["widgetProps$_$visible"]).toBe(false);
    });
});
