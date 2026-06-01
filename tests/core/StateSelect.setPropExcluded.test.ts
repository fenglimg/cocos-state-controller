/**
 * M2b-1 红测试: StateSelect.setPropExcluded(propRef, bool) 干净 mutation API.
 *
 * 边界搬迁 — 用显式方法替代 excludedPropsDisplay getter 的副作用 (reconcileUserExcluded) 路径:
 *   - setPropExcluded(ref, true)  → 加入 _userExcludedProps + 退出跟随 (isPropertyControlledByPropRef=false)
 *   - setPropExcluded(ref, false) → 从 _userExcludedProps 移除 + 重新接入跟随 (=true)
 *   - 同步 _lastSeenExcluded 快照, 避免后续 getter reconcile 重复 toggle
 *   - 幂等: 重复排除不重复入列; 排除不存在项 / 恢复未排除项 安全 no-op-ish
 *
 * 真 cocos 引擎集成测试 (不 mock cc). 红预期: setPropExcluded 不存在.
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
const { StateController } = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelect } = require("../../assets/script/controller/StateSelect");

const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

@ccclass("M2b1_Fixture")
class M2b1_Fixture extends ccL.Component {
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
    selectNode.addComponent(M2b1_Fixture);
    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ctrl, select, selectNode };
}

describe("M2b-1 setPropExcluded mutation API", () => {
    it("StateSelect 暴露 setPropExcluded 方法", () => {
        const { select } = setup();
        expect(typeof (select as any).setPropExcluded).toBe("function");
    });

    it("setPropExcluded(ref, true): 加入排除清单 + 退出跟随", () => {
        const { select } = setup();
        const ref = "M2b1_Fixture.heatLevel";
        expect(select.isPropertyControlledByPropRef(ref)).toBe(true);

        (select as any).setPropExcluded(ref, true);

        expect((select as any)._userExcludedProps).toContain(ref);
        expect(select.isPropertyControlledByPropRef(ref)).toBe(false);
    });

    it("setPropExcluded(ref, false): 从排除清单移除 + 重新接入跟随", () => {
        const { select } = setup();
        const ref = "M2b1_Fixture.label";
        (select as any).setPropExcluded(ref, true);
        expect(select.isPropertyControlledByPropRef(ref)).toBe(false);

        (select as any).setPropExcluded(ref, false);

        expect((select as any)._userExcludedProps).not.toContain(ref);
        expect(select.isPropertyControlledByPropRef(ref)).toBe(true);
    });

    it("幂等: 重复 setPropExcluded(ref, true) 不重复入列", () => {
        const { select } = setup();
        const ref = "M2b1_Fixture.heatLevel";
        (select as any).setPropExcluded(ref, true);
        (select as any).setPropExcluded(ref, true);
        const count = (select as any)._userExcludedProps.filter((r: string) => r === ref).length;
        expect(count).toBe(1);
    });

    it("同步 _lastSeenExcluded: 调用后 getter reconcile 不再重复 toggle (快照一致)", () => {
        const { select } = setup();
        const ref = "M2b1_Fixture.heatLevel";
        (select as any).setPropExcluded(ref, true);
        // setPropExcluded 后 _lastSeenExcluded 应与 _userExcludedProps 一致
        expect((select as any)._lastSeenExcluded).toEqual((select as any)._userExcludedProps);
        // 再读 getter (触发 reconcile) — 跟随状态不应被翻转回去
        void (select as any).excludedPropsDisplay;
        expect(select.isPropertyControlledByPropRef(ref)).toBe(false);
    });

    it("恢复未排除项 / 排除空 ref 安全", () => {
        const { select } = setup();
        expect(() => { (select as any).setPropExcluded("M2b1_Fixture.label", false); }).not.toThrow();
        expect(() => { (select as any).setPropExcluded("", true); }).not.toThrow();
        expect(() => { (select as any).setPropExcluded(null, true); }).not.toThrow();
    });

    it("cc.Node 内置 propRef 也可排除/恢复 (cc.Node.x)", () => {
        const { select } = setup();
        const ref = "cc.Node.x";
        expect(select.isPropertyControlledByPropRef(ref)).toBe(true);
        (select as any).setPropExcluded(ref, true);
        expect(select.isPropertyControlledByPropRef(ref)).toBe(false);
        (select as any).setPropExcluded(ref, false);
        expect(select.isPropertyControlledByPropRef(ref)).toBe(true);
    });
});

export {};
