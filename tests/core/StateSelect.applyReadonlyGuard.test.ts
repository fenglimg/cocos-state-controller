/**
 * 回归: apply 路径跳过只读 getter prop (如 cc.Node.children).
 *
 * 背景: 旧数据可能把只读属性 (getter only, 无 setter) 当受控塞进 ctrlData
 * (在录制侧 readonly 过滤加入前, 或全快照路径). apply 时 writeNodeValueByPropRef
 * 写 node.children = [] 会抛 "Cannot set property children ... only a getter",
 * 被 catch 成 "applyPropRefKeysToNode 写值失败" 警告刷屏.
 * 修复: apply 写值前对齐录制侧, tp.readonly 直接跳过.
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

function setup(stateCount = 2) {
    const root = new ccL.Node("RO_Root");
    const ctrlNode = new ccL.Node("RO_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("RO_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();
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

describe("apply 跳过只读 getter prop (回归)", () => {
    it("只读 cc.Node.children 脏数据: 不抛错 / 不尝试写 / 不破坏 children, 正常 prop 仍 apply", () => {
        const { ctrl, select, selectNode } = setup(2);

        // 正常受控 prop
        select.togglePropertyControl(EnumPropName.Opacity, true);
        const pd0 = (select as any).getPropData(0, ctrl.ctrlId);
        select.writePropByEnum(pd0, EnumPropName.Opacity, 123);

        // 注入旧脏数据: 把只读 cc.Node.children 当受控塞进 state0
        pd0["cc.Node.children"] = [];
        pd0.$$controlledProps$$ = pd0.$$controlledProps$$ || {};
        pd0.$$controlledProps$$["cc.Node.children"] = "cc.Node.children";

        const writeSpy = jest.spyOn(select as any, "writeNodeValueByPropRef");
        const childrenBefore = selectNode.children;

        // 切到别的 state 再切回 → 触发 state0 的 apply
        expect(() => { ctrl.selectedIndex = 1; ctrl.selectedIndex = 0; }).not.toThrow();

        // 正常 prop 仍被 apply
        expect(selectNode.opacity).toBe(123);
        // 只读 prop 被守卫跳过, 从未尝试写
        const triedWriteChildren = writeSpy.mock.calls.some((c: any[]) => c[0] === "cc.Node.children");
        expect(triedWriteChildren).toBe(false);
        // children 未被破坏 (仍是同一内部数组)
        expect(selectNode.children).toBe(childrenBefore);

        writeSpy.mockRestore();
    });
});

export {};
