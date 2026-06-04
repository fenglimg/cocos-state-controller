/**
 * StateControllerV2 嵌套场景缓存独立性回归测试
 *
 * 验证 B1 bug:「_stateSelectCache 不按 ctrlId 分桶, 嵌套 controller 场景互相串扰」
 *
 * 场景：parent controller 内嵌 child controller, 各自管理自己的 select。
 *   - 切换 parent 的 selectedIndex 不应影响 child 控制的 select
 *   - 切换 child 的 selectedIndex 不应影响 parent 控制的 select
 *   - parent.markCacheDirty() 不应误清掉 child 的缓存数据
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

/**
 * 节点树:
 *   Root
 *   ├── ParentCtrl (StateControllerV2)
 *   │   ├── ParentSelect (StateSelectV2, 直接被 ParentCtrl 控制)
 *   │   └── ChildCtrl (StateControllerV2)
 *   │       └── ChildSelect (StateSelectV2, 直接被 ChildCtrl 控制, 跨越 ChildCtrl 边界后不应被 ParentCtrl 直接控制)
 */
function setupNested() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");

    const parentCtrlNode = new ccLocal.Node("ParentCtrl");
    root.addChild(parentCtrlNode);

    const parentSelectNode = new ccLocal.Node("ParentSelect");
    parentCtrlNode.addChild(parentSelectNode);

    const childCtrlNode = new ccLocal.Node("ChildCtrl");
    parentCtrlNode.addChild(childCtrlNode);

    const childSelectNode = new ccLocal.Node("ChildSelect");
    childCtrlNode.addChild(childSelectNode);

    const parentCtrl = parentCtrlNode.addComponent(StateControllerV2);
    (parentCtrl as any).__preload();

    const childCtrl = childCtrlNode.addComponent(StateControllerV2);
    (childCtrl as any).__preload();

    const parentSelect = parentSelectNode.addComponent(StateSelectV2);
    (parentSelect as any).__preload();

    const childSelect = childSelectNode.addComponent(StateSelectV2);
    (childSelect as any).__preload();

    (parentCtrl as any).markCacheDirty();
    (childCtrl as any).markCacheDirty();

    return {
        root,
        parentCtrl, childCtrl,
        parentSelect, childSelect,
        parentSelectNode, childSelectNode,
    };
}

describe("StateControllerV2 nested cache isolation", () => {
    it("isDirectlyControlled 正确划分 parent / child 责任", () => {
        const { parentCtrl, childCtrl, parentSelectNode, childSelectNode } = setupNested();

        // parent 直控 ParentSelect, 不直控 ChildSelect (中间隔着 ChildCtrl)
        expect((parentCtrl as any).isDirectlyControlled(parentSelectNode)).toBe(true);
        expect((parentCtrl as any).isDirectlyControlled(childSelectNode)).toBe(false);

        // child 直控 ChildSelect
        expect((childCtrl as any).isDirectlyControlled(childSelectNode)).toBe(true);
    });

    it("parent.markCacheDirty 不影响 child 的缓存", () => {
        const { parentCtrl, childCtrl } = setupNested();

        // 触发一次重建, cache 进入 valid 状态
        (parentCtrl as any).rebuildStateSelectCache();
        (childCtrl as any).rebuildStateSelectCache();

        expect((parentCtrl as any)._cacheDirty).toBe(false);
        expect((childCtrl as any)._cacheDirty).toBe(false);

        // parent 单独 markDirty, child 应保持 clean
        (parentCtrl as any).markCacheDirty();
        expect((parentCtrl as any)._cacheDirty).toBe(true);
        expect((childCtrl as any)._cacheDirty).toBe(false);
    });

    it("跨 controller 切换 state 不应串扰对方控制的 select", () => {
        const { parentCtrl, childCtrl, parentSelect, childSelect, parentSelectNode, childSelectNode } = setupNested();

        // parent state 0: parentSelect.active = false
        parentCtrl.selectedIndex = 0;
        parentSelect.togglePropertyControl(EnumPropName.Active, true);
        parentSelectNode.active = false;
        (parentSelect as any).setDefaultProp(EnumPropName.Active);

        // child state 0: childSelect.active = false
        childCtrl.selectedIndex = 0;
        childSelect.togglePropertyControl(EnumPropName.Active, true);
        childSelectNode.active = false;
        (childSelect as any).setDefaultProp(EnumPropName.Active);

        // parent state 1: parentSelect.active = true
        parentCtrl.selectedIndex = 1;
        parentSelect.togglePropertyControl(EnumPropName.Active, true);
        parentSelectNode.active = true;
        (parentSelect as any).setDefaultProp(EnumPropName.Active);

        // 切换 parent 到 state 0, 期望:
        //   parentSelect.active 还原为 false (parent 应用)
        //   childSelect.active 保持 false (child 不被 parent 影响)
        parentCtrl.selectedIndex = 0;
        expect(parentSelectNode.active).toBe(false);
        expect(childSelectNode.active).toBe(false);

        // 切换 parent 到 state 1, 期望:
        //   parentSelect.active 还原为 true
        //   childSelect.active 保持 false
        parentCtrl.selectedIndex = 1;
        expect(parentSelectNode.active).toBe(true);
        expect(childSelectNode.active).toBe(false);
    });
});
