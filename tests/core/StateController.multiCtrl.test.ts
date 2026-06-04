/**
 * StateControllerV2 多 controller 共存测试 (Phase 4.4)
 *
 * 已有 StateControllerV2.nestedCache.test.ts 覆盖了 parent ↔ child 嵌套的责任划分
 * 与 cache 隔离. 这里补充:
 *   - 兄弟 (sibling) controller: 同父节点下两个并列子树各自一个 controller
 *   - 3 层深嵌套: outer / middle / inner 各管自己的 select
 *
 * 注: 同节点上只能挂一个 StateControllerV2 (cocos 组件单例机制), 不需要覆盖.
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
const ControllerMod = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SelectMod = require("../../assets/script/controller/StateSelectV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnumV2");

const { StateControllerV2 } = ControllerMod;
const { StateSelectV2 } = SelectMod;
const { EnumPropName } = EnumMod;

function makeCtrlSubtree(parent: any, ctrlName: string, selectName: string) {
    const ccL = (globalThis as any).cc;
    const ctrlNode = new ccL.Node(ctrlName);
    parent.addChild(ctrlNode);
    const selectNode = new ccL.Node(selectName);
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();
    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ctrlNode, selectNode, ctrl, select };
}

describe("多 controller: 兄弟 (sibling) 子树独立性", () => {
    function setupSiblings() {
        const ccL = (globalThis as any).cc;
        const root = new ccL.Node("MC_Root");
        const A = makeCtrlSubtree(root, "CtrlA", "SelectA");
        const B = makeCtrlSubtree(root, "CtrlB", "SelectB");
        return { root, A, B };
    }

    it("ctrlA 切换 state 不影响 ctrlB 控制下的 select", () => {
        const { A, B } = setupSiblings();

        A.ctrl.selectedIndex = 0;
        A.select.togglePropertyControl(EnumPropName.Opacity, true);
        A.selectNode.opacity = 50;
        (A.select as any).setDefaultProp(EnumPropName.Opacity);

        B.ctrl.selectedIndex = 0;
        B.select.togglePropertyControl(EnumPropName.Opacity, true);
        B.selectNode.opacity = 222;
        (B.select as any).setDefaultProp(EnumPropName.Opacity);

        A.ctrl.selectedIndex = 1;
        A.select.togglePropertyControl(EnumPropName.Opacity, true);
        A.selectNode.opacity = 150;
        (A.select as any).setDefaultProp(EnumPropName.Opacity);

        // 切 A 到 state 0, B 应不变
        A.ctrl.selectedIndex = 0;
        expect(A.selectNode.opacity).toBe(50);
        expect(B.selectNode.opacity).toBe(222);

        // 切 A 到 state 1, B 仍不变
        A.ctrl.selectedIndex = 1;
        expect(A.selectNode.opacity).toBe(150);
        expect(B.selectNode.opacity).toBe(222);
    });

    it("两个兄弟 ctrl 各自 isDirectlyControlled 只认自己子树下的 select", () => {
        const { A, B } = setupSiblings();
        expect((A.ctrl as any).isDirectlyControlled(A.selectNode)).toBe(true);
        expect((A.ctrl as any).isDirectlyControlled(B.selectNode)).toBe(false);
        expect((B.ctrl as any).isDirectlyControlled(B.selectNode)).toBe(true);
        expect((B.ctrl as any).isDirectlyControlled(A.selectNode)).toBe(false);
    });
});

describe("多 controller: 3 层深嵌套独立性", () => {
    /**
     * 节点树:
     *   Root
     *   └── OuterCtrl
     *       ├── OuterSelect           (outer 直控)
     *       └── MiddleCtrl
     *           ├── MiddleSelect      (middle 直控)
     *           └── InnerCtrl
     *               └── InnerSelect   (inner 直控)
     */
    function setupDeep() {
        const ccL = (globalThis as any).cc;
        const root = new ccL.Node("Deep_Root");
        const outerNode = new ccL.Node("OuterCtrl");
        root.addChild(outerNode);
        const outerSelectNode = new ccL.Node("OuterSelect");
        outerNode.addChild(outerSelectNode);
        const middleNode = new ccL.Node("MiddleCtrl");
        outerNode.addChild(middleNode);
        const middleSelectNode = new ccL.Node("MiddleSelect");
        middleNode.addChild(middleSelectNode);
        const innerNode = new ccL.Node("InnerCtrl");
        middleNode.addChild(innerNode);
        const innerSelectNode = new ccL.Node("InnerSelect");
        innerNode.addChild(innerSelectNode);

        const outerCtrl = outerNode.addComponent(StateControllerV2); (outerCtrl as any).__preload();
        const middleCtrl = middleNode.addComponent(StateControllerV2); (middleCtrl as any).__preload();
        const innerCtrl = innerNode.addComponent(StateControllerV2); (innerCtrl as any).__preload();

        const outerSelect = outerSelectNode.addComponent(StateSelectV2); (outerSelect as any).__preload();
        const middleSelect = middleSelectNode.addComponent(StateSelectV2); (middleSelect as any).__preload();
        const innerSelect = innerSelectNode.addComponent(StateSelectV2); (innerSelect as any).__preload();

        (outerCtrl as any).markCacheDirty();
        (middleCtrl as any).markCacheDirty();
        (innerCtrl as any).markCacheDirty();

        return {
            outerCtrl, middleCtrl, innerCtrl,
            outerSelect, middleSelect, innerSelect,
            outerSelectNode, middleSelectNode, innerSelectNode,
        };
    }

    it("每层 ctrl 只 isDirectlyControlled 自己直辖的 select", () => {
        const env = setupDeep();
        // outer 直控 outerSelect, 不直控 middleSelect / innerSelect
        expect((env.outerCtrl as any).isDirectlyControlled(env.outerSelectNode)).toBe(true);
        expect((env.outerCtrl as any).isDirectlyControlled(env.middleSelectNode)).toBe(false);
        expect((env.outerCtrl as any).isDirectlyControlled(env.innerSelectNode)).toBe(false);

        // middle 直控 middleSelect, 不直控 innerSelect
        expect((env.middleCtrl as any).isDirectlyControlled(env.middleSelectNode)).toBe(true);
        expect((env.middleCtrl as any).isDirectlyControlled(env.innerSelectNode)).toBe(false);
        expect((env.middleCtrl as any).isDirectlyControlled(env.outerSelectNode)).toBe(false);

        // inner 直控 innerSelect
        expect((env.innerCtrl as any).isDirectlyControlled(env.innerSelectNode)).toBe(true);
    });

    it("切换 outer state 只影响 outerSelect, 不影响 middle/inner", () => {
        const env = setupDeep();

        // 全部启用 Opacity, 在 state 0 / 1 分别记录不同值
        for (const layer of ["outer", "middle", "inner"] as const) {
            const ctrl = (env as any)[layer + "Ctrl"];
            const select = (env as any)[layer + "Select"];
            const node = (env as any)[layer + "SelectNode"];

            ctrl.selectedIndex = 0;
            select.togglePropertyControl(EnumPropName.Opacity, true);
            node.opacity = layer === "outer" ? 60 : layer === "middle" ? 120 : 180;
            (select as any).setDefaultProp(EnumPropName.Opacity);

            ctrl.selectedIndex = 1;
            select.togglePropertyControl(EnumPropName.Opacity, true);
            node.opacity = layer === "outer" ? 70 : layer === "middle" ? 130 : 190;
            (select as any).setDefaultProp(EnumPropName.Opacity);
        }

        // 把 middle/inner 都停在 state 1
        env.middleCtrl.selectedIndex = 1;
        env.innerCtrl.selectedIndex = 1;
        const middleSnap = env.middleSelectNode.opacity;
        const innerSnap = env.innerSelectNode.opacity;

        // 切 outer 到 state 0, 仅 outer 受影响
        env.outerCtrl.selectedIndex = 0;
        expect(env.outerSelectNode.opacity).toBe(60);
        expect(env.middleSelectNode.opacity).toBe(middleSnap);
        expect(env.innerSelectNode.opacity).toBe(innerSnap);

        // 切 outer 到 state 1, 仅 outer 受影响
        env.outerCtrl.selectedIndex = 1;
        expect(env.outerSelectNode.opacity).toBe(70);
        expect(env.middleSelectNode.opacity).toBe(middleSnap);
        expect(env.innerSelectNode.opacity).toBe(innerSnap);
    });

    it("切换 inner state 不冒泡影响 outer/middle", () => {
        const env = setupDeep();

        for (const layer of ["outer", "middle", "inner"] as const) {
            const ctrl = (env as any)[layer + "Ctrl"];
            const select = (env as any)[layer + "Select"];
            const node = (env as any)[layer + "SelectNode"];

            ctrl.selectedIndex = 0;
            select.togglePropertyControl(EnumPropName.Scale, true);
            node.scale = layer === "outer" ? 1 : layer === "middle" ? 2 : 3;
            (select as any).setDefaultProp(EnumPropName.Scale);

            ctrl.selectedIndex = 1;
            select.togglePropertyControl(EnumPropName.Scale, true);
            node.scale = layer === "outer" ? 1.5 : layer === "middle" ? 2.5 : 3.5;
            (select as any).setDefaultProp(EnumPropName.Scale);
        }

        env.outerCtrl.selectedIndex = 0;
        env.middleCtrl.selectedIndex = 0;
        const outerSnap = env.outerSelectNode.scale;
        const middleSnap = env.middleSelectNode.scale;

        env.innerCtrl.selectedIndex = 1;
        expect(env.innerSelectNode.scale).toBe(3.5);
        expect(env.outerSelectNode.scale).toBe(outerSnap);
        expect(env.middleSelectNode.scale).toBe(middleSnap);
    });
});
