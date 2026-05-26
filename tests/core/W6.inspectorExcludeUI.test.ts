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

    it("addExcludeTrigger setter 收到 value (>=1) 时, push 到 _userExcludedProps 且该 prop 从跟随中移除 (sentinel value=0 是占位)", () => {
        const { select } = setup();
        // 前置: __preload 自动接入 W6_ExcludeFixture.heatLevel
        expect((select as any).isPropertyControlledByPropRef("W6_ExcludeFixture.heatLevel")).toBe(true);
        // _addExcludeOptions[v-1] = propRef; enumList value 从 1 起 (0 是 sentinel)
        const options: string[] = (select as any)._addExcludeOptions;
        const idx = options.indexOf("W6_ExcludeFixture.heatLevel");
        expect(idx).toBeGreaterThanOrEqual(0);
        const enumValue = idx + 1; // value=1..N

        (select as any).addExcludeTrigger = enumValue;

        expect((select as any)._userExcludedProps).toContain("W6_ExcludeFixture.heatLevel");
        // reconcileUserExcluded 在 setter 内调过, 跟随应已移除
        expect((select as any).isPropertyControlledByPropRef("W6_ExcludeFixture.heatLevel")).toBe(false);
    });

    it("addExcludeTrigger setter 收到 0 (sentinel) 或非法值时 noop", () => {
        const { select } = setup();
        const before = [...((select as any)._userExcludedProps || [])];

        (select as any).addExcludeTrigger = 0; // sentinel
        expect((select as any)._userExcludedProps).toEqual(before);

        (select as any).addExcludeTrigger = 99999; // 越界
        expect((select as any)._userExcludedProps).toEqual(before);

        (select as any).addExcludeTrigger = NaN;
        expect((select as any)._userExcludedProps).toEqual(before);
    });

    it("数组化删除: 从 _userExcludedProps 数组中删项 (cocos 原生 - 按钮模拟) 触发 reconcile 重新接入跟随", () => {
        const { select } = setup();
        // 先排除一个 prop
        (select as any)._userExcludedProps = ["W6_ExcludeFixture.heatLevel"];
        // 触发 reconcile (模拟 inspector 渲染调 excludedPropsDisplay getter)
        void (select as any).excludedPropsDisplay;
        expect((select as any).isPropertyControlledByPropRef("W6_ExcludeFixture.heatLevel")).toBe(false);

        // 模拟用户在 cocos inspector 数组 - 按钮删项
        (select as any)._userExcludedProps = [];
        void (select as any).excludedPropsDisplay; // 触发 reconcile

        // reconcile 应已 toggle 重新接入
        expect((select as any).isPropertyControlledByPropRef("W6_ExcludeFixture.heatLevel")).toBe(true);
    });

    it("refreshExcludeEnumLists: addExcludeTrigger.enumList 含 sentinel + 当前跟随中, 不含已排除", () => {
        const { select } = setup();
        const attrs = ccL.Class.Attr.getClassAttrs(select);
        const addEnumList = attrs["addExcludeTrigger$_$enumList"];
        expect(Array.isArray(addEnumList)).toBe(true);
        // 第 0 项是 sentinel
        expect(addEnumList[0]).toEqual({ name: "(选一个加入排除)", value: 0 });
        // 真实选项 value 从 1 起
        const realItems = addEnumList.slice(1);
        const realNames = realItems.map((e: any) => e.name);
        expect(realNames).toContain("W6_ExcludeFixture.heatLevel");
        for (const ex of SYSTEM_EXCLUDE) {
            expect(realNames).not.toContain(ex);
        }
        // value 从 1 单调递增
        realItems.forEach((it: any, i: number) => expect(it.value).toBe(i + 1));
    });

    it("_userExcludedProps 是 @property visible:true 数组 (cocos 原生 +/- 按钮)", () => {
        const ctor = StateSelect;
        const attrs = ccL.Class.Attr.getClassAttrs(ctor);
        // visible 默认 true (不显式 false 即可); 类型应为 cc.String 数组
        expect(attrs["_userExcludedProps$_$visible"]).not.toBe(false);
        // displayName 应注入
        expect(attrs["_userExcludedProps$_$displayName"]).toBe("用户排除清单");
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

    // W6-4 hotfix2 #3: 搜索过滤
    it("excludeFilter setter: 设关键字后 refresh enumList 只保留 substring 匹配 (大小写不敏感)", () => {
        const { select } = setup();
        // 前置: addExcludeOptions 至少含 W6_ExcludeFixture.heatLevel + 一些 cc.Node.* 内置 prop
        (select as any).excludeFilter = "heat";
        const attrs = ccL.Class.Attr.getClassAttrs(select);
        const enumList = attrs["addExcludeTrigger$_$enumList"];
        // sentinel 仍在 (索引 0), 名字加了过滤提示
        expect(enumList[0].name).toContain("heat");
        expect(enumList[0].value).toBe(0);
        // 真实选项全部含 "heat" (大小写不敏感)
        const realItems = enumList.slice(1);
        for (const it of realItems) {
            expect(it.name.toLowerCase()).toContain("heat");
        }
        // 至少匹配 heatLevel
        expect(realItems.map((e: any) => e.name)).toContain("W6_ExcludeFixture.heatLevel");
    });

    it("excludeFilter setter: 空关键字恢复全部选项 (无过滤)", () => {
        const { select } = setup();
        (select as any).excludeFilter = "heat";
        let attrs = ccL.Class.Attr.getClassAttrs(select);
        const filteredCount = attrs["addExcludeTrigger$_$enumList"].length;

        (select as any).excludeFilter = "";
        attrs = ccL.Class.Attr.getClassAttrs(select);
        const unfilteredCount = attrs["addExcludeTrigger$_$enumList"].length;

        // 空关键字应不少于过滤后 (通常 >>)
        expect(unfilteredCount).toBeGreaterThanOrEqual(filteredCount);
        // sentinel 恢复无过滤提示
        expect(attrs["addExcludeTrigger$_$enumList"][0].name).toBe("(选一个加入排除)");
    });

    // W6-4 hotfix2 #1: 刷新按钮
    it("refreshInspectorTrigger setter: 调 reconcile + refresh enumList, 不抛", () => {
        const { select } = setup();
        // 设置一些 user 排除项, 然后调 refresh 应该重新 reconcile
        (select as any)._userExcludedProps = ["W6_ExcludeFixture.heatLevel"];
        (select as any)._lastSeenExcluded = []; // 模拟未同步状态
        expect(() => { (select as any).refreshInspectorTrigger = true; }).not.toThrow();
        // reconcile 应已跑 (_lastSeenExcluded 同步成 current)
        expect((select as any)._lastSeenExcluded).toEqual(["W6_ExcludeFixture.heatLevel"]);
    });
});
