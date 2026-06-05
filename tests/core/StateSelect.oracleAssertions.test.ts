/**
 * TASK-007 (T7): 附录A 8 条数据一致性 oracle 断言 → 可执行 jest 测试 (综合验收).
 *
 * 以"数据一致性 oracle"视角组织, 覆盖本轮各修复 (双轨统一 T1/T2 / #F-A T3 / #F-4 T4 /
 * 专项A T5/T6). 每条断言至少一个 it(), 标记 A#1..A#8 对应 SPEC 附录A.
 *
 *   A#1 controlledProps: 切 state 后有效值 = state 值, 缺则 default
 *   A#2 cancelRecording 后 number key 与 string propRef key 都回 _initialSnapshot (#F-A)
 *   A#3 reparent 只转"当前受控且未排除"的 x/y/z (#F-4)
 *   A#4 迁移后 propData 无非 meta 数字 key、无聚合 key 残留
 *   A#5 writePropByEnum 删同义 number key; readPropByEnum 双 key 以 string 为准
 *   A#6 新增 state 后 default 覆盖所有受控 prop
 *   A#7 删除/移动/复制 state 后 pageData[i] 与 states[i] 语义一致; 复制对象独立
 *   A#8 排除 prop 后 apply / 录制 full snapshot / reparent 都不写回该 prop (#F-6 内置)
 *
 * 真 cocos 引擎集成测试.
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
const { StateController, StateValue } = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelect } = require("../../assets/script/controller/StateSelectV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EnumPropName } = require("../../assets/script/controller/StateEnumV2");

const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

@ccclass("OracleFixture")
class OracleFixture extends ccL.Component {
    @property() public heat: number = 0;
}

const CUSTOM_PROPREF = "OracleFixture.heat";

function setup(stateCount = 2) {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("ORA_Root");
    const ctrlNode = new ccLocal.Node("ORA_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("ORA_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
    selectNode.addComponent(OracleFixture);
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    while ((ctrl as any)._states.length < stateCount) {
        const ns = (ctrl as any)._states.slice();
        ns.push(StateValue.create("S" + ns.length, (ctrl as any).stateIdAuto++));
        ctrl.states = ns;
    }
    return { ctrl, select, selectNode, root };
}

describe("附录A oracle 断言 (综合验收)", () => {
    it("A#1: 切 state 后有效值 = state 值, 缺则 default", () => {
        const { ctrl, select, selectNode } = setup(2);
        select.togglePropertyControl(EnumPropName.Opacity, true);
        const dd = (select as any).getDefaultData(ctrl.ctrlId);
        select.writePropByEnum(dd, EnumPropName.Opacity, 200);
        const pd0 = (select as any).getPropData(0, ctrl.ctrlId);
        select.writePropByEnum(pd0, EnumPropName.Opacity, 100);
        // state1 缺 opacity → 走 default
        const pd1 = (select as any).getPropData(1, ctrl.ctrlId);
        delete pd1["cc.Node.opacity"];
        delete pd1[EnumPropName.Opacity];

        ctrl.selectedIndex = 1;
        ctrl.selectedIndex = 0; // state 有值
        expect(selectNode.opacity).toBe(100);
        ctrl.selectedIndex = 1; // state 缺值 → default
        expect(selectNode.opacity).toBe(200);
    });

    it("A#2: cancelRecording 后 string propRef key 回到录制前 (#F-A)", () => {
        const { ctrl, select, selectNode } = setup(2);
        const fixture = selectNode.getComponent(OracleFixture);
        ctrl.selectedIndex = 0;
        fixture.heat = 10;
        select.togglePropertyControl(CUSTOM_PROPREF, true);
        (select as any).getPropData(0, ctrl.ctrlId)[CUSTOM_PROPREF] = 10;

        ctrl.startRecording();
        fixture.heat = 99;
        (select as any).onStateWillChange(ctrl, 0);
        expect((select as any).getPropData(0, ctrl.ctrlId)[CUSTOM_PROPREF]).toBe(99);

        (ctrl as any).cancelRecording();
        expect((select as any).getPropData(0, ctrl.ctrlId)[CUSTOM_PROPREF]).toBe(10);
    });

    it("A#3: reparent 只转当前受控且未排除的轴 (#F-4)", () => {
        const { ctrl, select, selectNode, root } = setup(2);
        const pageData = (select as any)._ctrlData[ctrl.ctrlId];
        pageData[0] = pageData[0] || {};
        pageData[0]["cc.Node.x"] = 100;
        pageData[0]["cc.Node.y"] = 50;
        select.setPropExcluded("cc.Node.x", true);
        expect(select.isPropertyControlledByPropRef("cc.Node.x")).toBe(false);

        const parentA = new ccL.Node("PA"); parentA.setPosition(0, 0); root.addChild(parentA);
        const parentB = new ccL.Node("PB"); parentB.setPosition(300, 0); root.addChild(parentB);
        selectNode.removeFromParent(false); parentB.addChild(selectNode);
        (select as any).transPosition(parentA);

        // x 被排除 → 残留值不动
        expect(pageData[0]["cc.Node.x"]).toBe(100);
    });

    it("A#4: 迁移后 propData 无非 meta 数字 key、无聚合 number key 残留", () => {
        const { ctrl, select } = setup(2);
        const cid = ctrl.ctrlId;
        (select as any)._ctrlData[cid][1] = {
            [EnumPropName.Active]: true,
            [EnumPropName.Color]: "c",
            [EnumPropName.Position]: "p",   // 聚合
            [EnumPropName.GrayScale]: "g",  // legacy dropped
            [CUSTOM_PROPREF]: 7,
            $$controlledProps$$: { [CUSTOM_PROPREF]: 1 },
        };
        (select as any).migrateLegacyCtrlData();

        const state1 = (select as any)._ctrlData[cid][1];
        const numericNonMeta = Object.keys(state1).filter(
            k => !k.startsWith("$$") && /^\d+$/.test(k),
        );
        expect(numericNonMeta).toEqual([]); // 无残留数字 key
        // 聚合 Position number key 已迁 string
        expect(state1[EnumPropName.Position]).toBeUndefined();
        expect(state1["cc.Node.position"]).toBe("p");
        // 自定义 string key 不动
        expect(state1[CUSTOM_PROPREF]).toBe(7);
    });

    it("A#5: writePropByEnum 删同义 number key; readPropByEnum 双 key 以 string 为准", () => {
        const { select } = setup(2);
        const pd: any = {};
        pd[EnumPropName.Opacity] = 50; // 遗留 number key
        select.writePropByEnum(pd, EnumPropName.Opacity, 80);
        expect(pd[EnumPropName.Opacity]).toBeUndefined(); // number key 被删
        expect(pd["cc.Node.opacity"]).toBe(80);

        // 双 key 并存时 read 以 string 为准
        pd[EnumPropName.Opacity] = 50;
        pd["cc.Node.opacity"] = 80;
        expect(select.readPropByEnum(pd, EnumPropName.Opacity)).toBe(80);
    });

    it("A#6: 新增 state 后 default 覆盖所有受控 prop", () => {
        const { ctrl, select, selectNode } = setup(2);
        const fixture = selectNode.getComponent(OracleFixture);
        fixture.heat = 5;
        select.togglePropertyControl(EnumPropName.Opacity, true);
        select.togglePropertyControl(CUSTOM_PROPREF, true);

        // 新增一个 state
        const ns = (ctrl as any)._states.slice();
        ns.push(StateValue.create("S_new", (ctrl as any).stateIdAuto++));
        ctrl.states = ns;

        const dd = (select as any).getDefaultData(ctrl.ctrlId);
        // 所有受控 prop 在 default 都有值
        expect(select.readPropByEnum(dd, EnumPropName.Opacity)).not.toBeUndefined();
        expect(dd[CUSTOM_PROPREF]).not.toBeUndefined();
    });

    it("A#7: 复制 state 后对象独立 + 移动后数据按 stateId 保持身份", () => {
        const { ctrl, select } = setup(3);
        const cid = ctrl.ctrlId;
        const page = (select as any)._ctrlData[cid];
        const s0 = ctrl.states[0].stateId;
        const s1 = ctrl.states[1].stateId;
        const s2 = ctrl.states[2].stateId;
        page[s0] = { "cc.Node.x": 10 };
        page[s1] = { "cc.Node.x": 20 };
        page[s2] = { "cc.Node.x": 30 };

        // 复制: state0 → state1 槽 (右移腾位, statesLength=3)
        (select as any).updateStateCopy(ctrl, { fromIndex: 0, toIndex: 1 });
        expect(page[s1]).toEqual({ "cc.Node.x": 10 });
        // 深拷独立: 改副本不影响源
        page[s1]["cc.Node.x"] = -1;
        expect(page[s0]["cc.Node.x"]).toBe(10);

        // 移动: 只改变展示顺序, stateId 数据不迁移
        const page2 = (select as any)._ctrlData[cid];
        page2[s0] = { "cc.Node.x": 100 };
        page2[s1] = { "cc.Node.x": 200 };
        page2[s2] = { "cc.Node.x": 300 };
        (select as any).updateStateMove(ctrl, { fromIndex: 0, toIndex: 2 });
        expect(page2[s0]["cc.Node.x"]).toBe(100);
        expect(page2[s2]["cc.Node.x"]).toBe(300);
    });

    it("A#8: 排除内置 prop 后切 state apply 不写回 baseline (#F-6)", () => {
        const { ctrl, select, selectNode } = setup(2);
        select.setPropExcluded("cc.Node.active", true);
        ctrl.selectedIndex = 0;
        selectNode.active = false; // 改排除后的内置 prop
        ctrl.selectedIndex = 1;    // 切 state → apply
        // 排除被尊重: 不被拽回 baseline true
        expect(selectNode.active).toBe(false);
    });
});

export {};
