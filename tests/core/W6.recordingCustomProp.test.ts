/**
 * W6-2a-fixup 端到端红测试: Recording 路径闭环自定义 @ccclass 组件 prop.
 *
 * W6-2a 实装了"自动接入"自定义 @ccclass 组件 @property prop (autoOptInCustomComponentProps),
 * 但漏了 Recording 期间 detect dirty + commit 路径. 当前 collectDirtyControlled /
 * detectUntrackedDirty / readAllApplicablePropsFromNode 只走 EnumPropName 数字内置 prop,
 * 不识别自定义 propRef 字符串 key.
 *
 * 现象: 用户编辑器手测 Helloworld.lbl (cc.String @property) 改值, Recording 期间不被 detect
 * 也不被 commit, 跨 state 切换 lbl 不被恢复.
 *
 * 修: 三个 Recording 方法加 string propRef 分支 + helper readPropFromNodeByPropRef.
 *
 * 红预期 (修复前):
 *   - collectDirtyControlled 漏自定义 prop (PropHandlerManager.getValue 拿不到 string propType)
 *   - detectUntrackedDirty 漏自定义 prop (_fullSnapshot 不含自定义 key)
 *   - readAllApplicablePropsFromNode 仅扫内置, _fullSnapshot 永远不含自定义
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
    const Editor: any;
}

let dialogCalls: Array<{ opts: any; resp: number }> = [];
let dialogResponse = 0;

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = {
        log: () => {}, warn: () => {}, error: () => {},
        Utils: { refreshSelectedInspector: () => {} },
        Dialog: {
            messageBox: (opts: any, cb: any) => {
                dialogCalls.push({ opts, resp: dialogResponse });
                if (typeof cb === "function") cb(dialogResponse);
                return dialogResponse;
            },
        },
    };
});

beforeEach(() => {
    dialogCalls = [];
    dialogResponse = 0;
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ControllerMod = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelect");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnum");

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;
const { EnumPropName } = EnumMod;

// 自定义 @ccclass fixture — Helloworld 同型 (heat=number, lbl=string)
const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

@ccclass("W6_RecCustomComp")
class W6_RecCustomComp extends ccL.Component {
    @property() public heat: number = 0;
    @property(ccL.String) public lbl: string = "init";
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

    // 先挂自定义 fixture, 再挂 StateSelect, 让 __preload 时能扫到
    const fixture = selectNode.addComponent(W6_RecCustomComp);

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();

    (ctrl as any).markCacheDirty();

    return { root, ctrl, select, selectNode, fixture };
}

describe("W6-2a-fixup: Recording 路径闭环自定义 propRef", () => {
    it("readPropFromNodeByPropRef helper 存在且能读 cc.Node.* 与自定义组件字段", () => {
        const { select, selectNode, fixture } = setup();
        // 验证 helper 已新增
        expect(typeof (select as any).readPropFromNodeByPropRef).toBe("function");

        // cc.Node.* 路径: 走 node[field]
        const activeVal = (select as any).readPropFromNodeByPropRef("cc.Node.active");
        expect(activeVal).toBe(true); // 默认 active

        // 自定义组件路径: getComponent + [field]
        fixture.heat = 77;
        fixture.lbl = "hot";
        expect((select as any).readPropFromNodeByPropRef("W6_RecCustomComp.heat")).toBe(77);
        expect((select as any).readPropFromNodeByPropRef("W6_RecCustomComp.lbl")).toBe("hot");

        // 不存在的组件 → undefined
        expect((select as any).readPropFromNodeByPropRef("NoSuchComp.foo")).toBeUndefined();

        // lastIndexOf 分隔: 内置 propRef 含多个 '.' (如 'cc.Label.string')
        // 这里没挂 Label 组件, 应返回 undefined 而非崩
        expect(() => (select as any).readPropFromNodeByPropRef("cc.Label.string")).not.toThrow();

        void selectNode;
    });

    it("Recording 中改自定义 prop → collectDirtyControlled detect 到 propRef dirty", () => {
        const { ctrl, select, fixture } = setup();
        ctrl.selectedIndex = 0;
        ctrl.startRecording();

        // 改自定义 prop heat (已被 autoOptIn 接入)
        fixture.heat = 99;

        const dirty = select.collectDirtyControlled(ctrl);
        // dirty 数组应含一条 propRef = W6_RecCustomComp.heat 的记录
        const found = dirty.find((d: any) => d.propRef === "W6_RecCustomComp.heat");
        expect(found).toBeDefined();
        expect(found.current).toBe(99);
        // stored 是 baseline (0)
        expect(found.stored).toBe(0);
    });

    it("Recording → 改自定义 lbl (string) → stopRecording → ctrlData[state] 用 propRef key 存值", () => {
        const { ctrl, select, fixture } = setup();
        ctrl.selectedIndex = 1;
        ctrl.startRecording();

        fixture.lbl = "newLabel";
        fixture.heat = 42;
        ctrl.stopRecording();

        const ctrlData = (select as any)._ctrlData[ctrl.ctrlId];
        expect(ctrlData[1]).toBeDefined();
        // propRef 字符串 key 存 commit 值
        expect(ctrlData[1]["W6_RecCustomComp.lbl"]).toBe("newLabel");
        expect(ctrlData[1]["W6_RecCustomComp.heat"]).toBe(42);
    });

    it("切 state apply: state 1 的自定义 lbl 值应被恢复 (跨 state 闭环)", () => {
        const { ctrl, select, fixture } = setup();

        // state 1 录入 lbl=hot + heat=99
        ctrl.selectedIndex = 1;
        ctrl.startRecording();
        fixture.lbl = "hot";
        fixture.heat = 99;
        ctrl.stopRecording();

        // 切回 state 0 — lbl 应回到 baseline ("init")
        ctrl.selectedIndex = 0;
        expect(fixture.lbl).toBe("init");
        expect(fixture.heat).toBe(0);

        // 再切到 state 1 — lbl 应 apply 到 "hot"
        ctrl.selectedIndex = 1;
        expect(fixture.lbl).toBe("hot");
        expect(fixture.heat).toBe(99);

        void select;
    });

    it("detectUntrackedDirty: 自定义 prop 未跟随 (用户 opt-out) 但被改 → 应被 detect", () => {
        const { ctrl, select, fixture } = setup();
        ctrl.selectedIndex = 0;

        // opt-out 自定义 prop heat: 用 propRef 联合 API
        select.togglePropertyControl("W6_RecCustomComp.heat", false);
        expect(select.isPropertyControlled("W6_RecCustomComp.heat")).toBe(false);

        ctrl.startRecording();
        // 验证 _fullSnapshot 含自定义 propRef key
        const fullSnap = (select as any)._fullSnapshot;
        expect(fullSnap).toBeDefined();
        expect(fullSnap["W6_RecCustomComp.heat"]).toBeDefined();

        // 改未勾的自定义 prop
        fixture.heat = 50;

        const untracked = (select as any).detectUntrackedDirty();
        // 应 detect 到该 propRef (字符串元素)
        expect(untracked).toContain("W6_RecCustomComp.heat");
    });

    it("混合 dirty: 同时改内置 (cc.Node.active) + 自定义 (W6_RecCustomComp.heat) → collectDirtyControlled 两者都返回", () => {
        const { ctrl, select, selectNode, fixture } = setup();
        ctrl.selectedIndex = 0;
        ctrl.startRecording();

        // 改内置 prop active (autoOptIn 已接入)
        selectNode.active = false;
        // 改自定义 prop heat
        fixture.heat = 33;

        const dirty = select.collectDirtyControlled(ctrl);
        // W6-axis-decomp: 内置 schema 统一为 {propRef: 'cc.Node.active', ...} (X 方案废 dual-key)
        const builtin = dirty.find((d: any) => d.propRef === "cc.Node.active");
        expect(builtin).toBeDefined();
        expect(builtin.current).toBe(false);

        // 自定义: schema {propRef: 'W6_RecCustomComp.heat', ...}
        const custom = dirty.find((d: any) => d.propRef === "W6_RecCustomComp.heat");
        expect(custom).toBeDefined();
        expect(custom.current).toBe(33);
    });

    it("readAllApplicablePropsFromNode (Recording 开始) 应扫到内置 + 自定义 propRef key (X 方案单 key)", () => {
        const { ctrl, select } = setup();
        ctrl.selectedIndex = 0;
        ctrl.startRecording();

        const fullSnap = (select as any)._fullSnapshot;
        // W6-axis-decomp: 全部统一 string propRef key, 不再有 EnumPropName 数字 key
        expect(fullSnap["cc.Node.active"]).toBe(true);
        // 自定义 propRef 字符串 key
        expect(fullSnap["W6_RecCustomComp.heat"]).toBeDefined();
        expect(fullSnap["W6_RecCustomComp.lbl"]).toBeDefined();
        // 数字 key 应 0 个 (X 方案彻底废)
        const numericKeys = Object.keys(fullSnap).filter(k => /^\d+$/.test(k));
        expect(numericKeys).toEqual([]);
    });
});
