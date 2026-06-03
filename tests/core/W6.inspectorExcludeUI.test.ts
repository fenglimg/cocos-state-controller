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
        // 折叠组重构后: 可见的 addExcludeTrigger 在 excludeGroup 上, enumList 注入到该组类.
        const attrs = ccL.Class.Attr.getClassAttrs((select as any).excludeGroup);
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

    it("用户排除清单数组移入 excludeGroup 折叠组 (cocos 原生 +/- 按钮), StateSelect 上的序列化字段转隐藏", () => {
        // 折叠组重构后: 序列化字段 _userExcludedProps 在 StateSelect 上转 visible:false (不直显),
        // 可见的「用户排除清单」由 excludeGroup.userExcludedProps 代理 (同一份数组引用).
        const selectAttrs = ccL.Class.Attr.getClassAttrs(StateSelect);
        expect(selectAttrs["_userExcludedProps$_$visible"]).toBe(false);

        const { select } = setup();
        const groupAttrs = ccL.Class.Attr.getClassAttrs((select as any).excludeGroup);
        // 折叠组里的 userExcludedProps 可见 (默认/未显式 false) + displayName 注入
        expect(groupAttrs["userExcludedProps$_$visible"]).not.toBe(false);
        expect(groupAttrs["userExcludedProps$_$displayName"]).toBe("用户排除清单");
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

/**
 * 回归: 被排除的 prop 在录制期间被改, 不应进入录制范围 (不 detect, 不弹窗, 不 commit).
 *
 * 用户场景: x=200, 把 cc.Node.x 加入排除清单, 点录制, 录制中误改 x → 结束录制后 x 仍按改后值"被记录".
 * 根因: readAllApplicablePropsFromNode 构建 _fullSnapshot 时未过滤 _userExcludedProps, 导致排除的 prop
 *       被 detectUntrackedDirty 当"未跟随 dirty"弹窗回写, 违背"排除 = 彻底脱离录制"语义.
 *
 * 红预期 (修复前): _fullSnapshot 含 cc.Node.x, detectUntrackedDirty 返回 cc.Node.x.
 */
describe("W6 回归: 排除清单 prop 不进录制范围", () => {
    function excludePropRef(select: any, propRef: string) {
        if (!select._userExcludedProps) select._userExcludedProps = [];
        if (select._userExcludedProps.indexOf(propRef) === -1) select._userExcludedProps.push(propRef);
        // 触发 reconcile (模拟 inspector 渲染调 excludedPropsDisplay getter) → togglePropertyControl(propRef, false)
        void select.excludedPropsDisplay;
    }

    it("排除 cc.Node.x 后录制中改 x → _fullSnapshot 不含 x, detectUntrackedDirty 不返回 x", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.selectedIndex = 0;
        selectNode.x = 200;

        // 加入排除清单 → 从跟随移除
        excludePropRef(select, "cc.Node.x");
        expect(select.isPropertyControlledByPropRef("cc.Node.x")).toBe(false);

        ctrl.startRecording();
        // _fullSnapshot 不应含被排除的 cc.Node.x (彻底脱离录制范围)
        const fullSnap = (select as any)._fullSnapshot;
        expect(fullSnap).toBeDefined();
        expect(fullSnap["cc.Node.x"]).toBeUndefined();

        // 录制中误改 x
        selectNode.x = 500;

        // detectUntrackedDirty 不应把排除的 x 当"未跟随 dirty"
        const untracked = (select as any).detectUntrackedDirty();
        expect(untracked).not.toContain("cc.Node.x");
    });

    it("排除 cc.Node.x 后录制改 x → stopRecording 不把改后值写进 ctrlData", () => {
        const { ctrl, select, selectNode } = setup();
        ctrl.selectedIndex = 0;
        selectNode.x = 200;

        excludePropRef(select, "cc.Node.x");

        ctrl.startRecording();
        selectNode.x = 500;
        ctrl.stopRecording();

        const ctrlData = (select as any)._ctrlData[ctrl.ctrlId];
        // 排除的 x: 录制改后值 (500) 不应被 commit. (autoOptIn baseline 残留 key 无害, apply 路径已 filter 排除项)
        const recordedX = ctrlData[0] && ctrlData[0]["cc.Node.x"];
        expect(recordedX).not.toBe(500);
    });
});
