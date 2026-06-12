/**
 * 红测试: 排除清单「- 恢复跟随」下拉 + 显示列双标记
 *
 * 验证 StateSelectV2 新增交互 (grill 设计摘要):
 *   1. removeExcludeTrigger (number setter): 反查 _removeExcludeOptions[v-1] → setPropExcluded(ref, false)
 *      从 _userExcludedProps 移除并恢复跟随. sentinel value=0 noop.
 *   2. refreshExcludeEnumLists: 额外注入 removeExcludeTrigger.enumList = [sentinel + 原始 _userExcludedProps 全列].
 *      列原始数组 (含失效项), 使下拉同时能清理失效 propRef.
 *   3. excludedPropsDisplay 双标记: 系统项加 "[系统] " 前缀; 用户失效项 (不在 listTrackableProps) 加 "[失效] " 前缀;
 *      用户有效项无前缀. (前缀只活在 display getter, _userExcludedProps 原始数据 + 下拉 enumList 保持纯净 propRef.)
 *   4. SelectExcludeGroup facade 含 removeExcludeTrigger.
 *
 * 红预期: 当前无 removeExcludeTrigger / _removeExcludeOptions, 显示列无标记 → 全红.
 *
 * 不 mock cc, 走真 cocos 引擎集成测试.
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
const ControllerMod = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelectV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IntrospectionMod = require("../../assets/script/controller/PrefabIntrospection");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectGroupsMod = require("../../assets/script/controller/props/SelectInspectorGroups");

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;
const { SYSTEM_EXCLUDE } = IntrospectionMod;
const { SelectExcludeGroup } = SelectGroupsMod;

const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

@ccclass("W6_RemoveFixture")
class W6_RemoveFixture extends ccL.Component {
    @property() public heatLevel: number = 0;
    @property() public label: string = "foo";
}

function setup() {
    const root = new ccL.Node("Root");
    const ctrlNode = new ccL.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    selectNode.addComponent(W6_RemoveFixture);

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ctrl, select, selectNode };
}

describe("排除清单「- 恢复跟随」下拉", () => {
    it("removeExcludeTrigger setter 收到 value(>=1): 反查移除该 propRef 并恢复跟随", () => {
        const { select } = setup();
        // 先排除 heatLevel
        (select as any).setPropExcluded("W6_RemoveFixture.heatLevel", true);
        expect((select as any)._userExcludedProps).toContain("W6_RemoveFixture.heatLevel");
        expect((select as any).isPropertyControlledByPropRef("W6_RemoveFixture.heatLevel")).toBe(false);

        // refreshExcludeEnumLists 已在 setPropExcluded 内刷过 _removeExcludeOptions
        const options: string[] = (select as any)._removeExcludeOptions;
        const idx = options.indexOf("W6_RemoveFixture.heatLevel");
        expect(idx).toBeGreaterThanOrEqual(0);

        (select as any).removeExcludeTrigger = idx + 1; // value 从 1 起

        // 已从清单移除 + 恢复跟随
        expect((select as any)._userExcludedProps).not.toContain("W6_RemoveFixture.heatLevel");
        expect((select as any).isPropertyControlledByPropRef("W6_RemoveFixture.heatLevel")).toBe(true);
    });

    it("removeExcludeTrigger setter 收到 0(sentinel)/非法值时 noop", () => {
        const { select } = setup();
        (select as any).setPropExcluded("W6_RemoveFixture.heatLevel", true);
        const before = [...((select as any)._userExcludedProps || [])];

        (select as any).removeExcludeTrigger = 0;
        expect((select as any)._userExcludedProps).toEqual(before);
        (select as any).removeExcludeTrigger = 99999;
        expect((select as any)._userExcludedProps).toEqual(before);
        (select as any).removeExcludeTrigger = NaN;
        expect((select as any)._userExcludedProps).toEqual(before);
    });

    it("removeExcludeTrigger getter 恒返回 0 (操作完回到 sentinel)", () => {
        const { select } = setup();
        expect((select as any).removeExcludeTrigger).toBe(0);
    });

    it("失效 propRef 也能从下拉清掉 (toggle 安全 no-op, 但列表照样移除)", () => {
        const { select } = setup();
        // 直接塞一个失效 ref (组件不存在), 不走 setPropExcluded 的 toggle
        (select as any)._userExcludedProps = ["GhostComp.dead"];
        (select as any).refreshExcludeEnumLists();
        const options: string[] = (select as any)._removeExcludeOptions;
        const idx = options.indexOf("GhostComp.dead");
        expect(idx).toBeGreaterThanOrEqual(0); // 失效项也入下拉

        expect(() => { (select as any).removeExcludeTrigger = idx + 1; }).not.toThrow();
        expect((select as any)._userExcludedProps).not.toContain("GhostComp.dead");
    });

    it("refreshExcludeEnumLists: removeExcludeTrigger.enumList = sentinel + 原始 _userExcludedProps 全列", () => {
        const { select } = setup();
        (select as any)._userExcludedProps = ["W6_RemoveFixture.heatLevel", "GhostComp.dead"];
        (select as any).refreshExcludeEnumLists();

        const attrs = ccL.Class.Attr.getClassAttrs(SelectExcludeGroup);
        const removeEnum = attrs["removeExcludeTrigger$_$enumList"];
        expect(Array.isArray(removeEnum)).toBe(true);
        expect(removeEnum[0]).toEqual({ name: "(选一个恢复跟随)", value: 0 });
        const realNames = removeEnum.slice(1).map((e: any) => e.name);
        // 原始全列: 有效项 + 失效项都在 (不被 listTrackableProps 过滤)
        expect(realNames).toContain("W6_RemoveFixture.heatLevel");
        expect(realNames).toContain("GhostComp.dead");
        // value 从 1 单调递增
        removeEnum.slice(1).forEach((it: any, i: number) => expect(it.value).toBe(i + 1));
    });

    it("SelectExcludeGroup facade 含 removeExcludeTrigger, 代理到 owner", () => {
        const { select } = setup();
        const group = (select as any).excludeGroup;
        expect(typeof group.removeExcludeTrigger).toBe("number");
        (select as any).setPropExcluded("W6_RemoveFixture.heatLevel", true);
        const idx = ((select as any)._removeExcludeOptions as string[]).indexOf("W6_RemoveFixture.heatLevel");
        group.removeExcludeTrigger = idx + 1; // 经 facade 写
        expect((select as any)._userExcludedProps).not.toContain("W6_RemoveFixture.heatLevel");
    });
});

describe("排除清单显示列双标记", () => {
    it("系统项加 [系统] 前缀", () => {
        const { select } = setup();
        const display = (select as any).excludedPropsDisplay;
        for (const ex of SYSTEM_EXCLUDE) {
            expect(display).toContain(`[系统] ${ex}`);
            expect(display).not.toContain(ex); // 裸字符串不应出现
        }
    });

    it("用户有效项无前缀", () => {
        const { select } = setup();
        (select as any)._userExcludedProps = ["W6_RemoveFixture.heatLevel"];
        const display = (select as any).excludedPropsDisplay;
        expect(display).toContain("W6_RemoveFixture.heatLevel");
    });

    it("用户失效项 (不在 listTrackableProps) 加 [失效] 前缀", () => {
        const { select } = setup();
        (select as any)._userExcludedProps = ["GhostComp.dead"];
        const display = (select as any).excludedPropsDisplay;
        expect(display).toContain("[失效] GhostComp.dead");
        expect(display).not.toContain("GhostComp.dead");
    });

    it("下拉 enumList 与原始数据保持纯净 propRef (前缀只在 display)", () => {
        const { select } = setup();
        (select as any)._userExcludedProps = ["GhostComp.dead"];
        (select as any).refreshExcludeEnumLists();
        // 下拉选项不带前缀
        expect((select as any)._removeExcludeOptions).toContain("GhostComp.dead");
        expect((select as any)._removeExcludeOptions).not.toContain("[失效] GhostComp.dead");
        // 原始数组不带前缀
        expect((select as any)._userExcludedProps).toEqual(["GhostComp.dead"]);
    });
});
