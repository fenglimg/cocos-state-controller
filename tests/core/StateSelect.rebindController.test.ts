/**
 * StateSelectV2.rebindController() 契约
 *
 * 场景: 把带 StateSelectV2 的节点拷贝粘贴到另一个 prefab 后, _currCtrlId/_ctrlsMap 仍指向老 prefab
 * 的控制器 (新 prefab 里不存在). rebindController 按当前祖先链重扫重绑.
 *
 * 数据策略 (见 rebindController 实现):
 *   - 真切到一个不同控制器 → 清 _ctrlsMap/_root 甩掉死控制器 + 全删 _ctrlData (重来) + 绑新控制器.
 *   - 目标与当前同一控制器 → no-op, 不动数据 (防误点).
 *   - 没扫到任何控制器 → no-op, 不动数据 (无东西可绑, 不删唯一数据).
 *   - CC_EDITOR=false → 直接返回.
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

const { StateController } = ControllerMod;
const { StateSelect } = SelectMod;

const STALE_CTRL_ID = 999999;

/** root > ctrlNode(StateController) > selectNode(StateSelect), 二者均已 __preload. select 默认绑到 ctrl. */
function setupCtrlAndSelect() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("RB_Root");
    const ctrlNode = new ccL.Node("RB_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("RB_SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    return { root, ctrlNode, selectNode, ctrl, select };
}

/** root > selectNode(StateSelect), 祖先链上没有任何 StateController. 不 __preload (避免无控制器时 _onPreDestroy). */
function setupSelectWithoutController() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("RB_NoCtrl_Root");
    const selectNode = new ccL.Node("RB_NoCtrl_SelectNode");
    root.addChild(selectNode);
    const select = selectNode.addComponent(StateSelect);
    return { root, selectNode, select };
}

describe("StateSelectV2.rebindController — 真切换到不同控制器", () => {
    it("悬空绑定 → 重绑到当前链上的真实控制器, 并全删旧状态数据", () => {
        const { ctrl, select } = setupCtrlAndSelect();
        const realId = ctrl.ctrlId;

        // 模拟拷贝粘贴: 绑定指向不存在的老 prefab 控制器, _ctrlData 留着老 prefab 的孤儿数据.
        (select as any)._currCtrlId = STALE_CTRL_ID;
        (select as any)._ctrlData = { [STALE_CTRL_ID]: { 0: { foo: 1 } } };

        select.rebindController();

        expect(select.currCtrlId).toBe(realId);
        // 孤儿数据被全删, 老 ctrlId 不再残留.
        expect((select as any)._ctrlData[STALE_CTRL_ID]).toBeUndefined();
    });

    it("清掉 _ctrlsMap 里的悬空老控制器 (修下拉残留死控制器)", () => {
        const { ctrl, select } = setupCtrlAndSelect();
        const realId = ctrl.ctrlId;

        // 人为往 _ctrlsMap 塞一个死控制器, 并把绑定指向它.
        (select as any)._ctrlsMap[STALE_CTRL_ID] = null;
        (select as any)._currCtrlId = STALE_CTRL_ID;

        select.rebindController();

        expect((select as any)._ctrlsMap[STALE_CTRL_ID]).toBeUndefined();
        expect((select as any)._ctrlsMap[realId]).toBeTruthy();
        expect(select.currCtrlId).toBe(realId);
    });
});

describe("StateSelectV2.rebindController — 兜底: 同一控制器", () => {
    it("目标与当前一致 → no-op, 不清数据", () => {
        const { ctrl, select } = setupCtrlAndSelect();
        const realId = ctrl.ctrlId;
        expect(select.currCtrlId).toBe(realId);

        // 当前绑定有效, 且带有真实数据.
        (select as any)._ctrlData = { [realId]: { 0: { keep: 1 } } };

        select.rebindController();

        expect(select.currCtrlId).toBe(realId);
        // 同控制器不动数据.
        expect((select as any)._ctrlData[realId]).toEqual({ 0: { keep: 1 } });
    });
});

describe("StateSelectV2.rebindController — 兜底: 没扫到控制器", () => {
    it("祖先链无控制器 → no-op, 不删唯一的数据", () => {
        const { select } = setupSelectWithoutController();

        (select as any)._currCtrlId = STALE_CTRL_ID;
        (select as any)._ctrlData = { [STALE_CTRL_ID]: { 0: { keep: 1 } } };

        select.rebindController();

        // 无东西可绑, 绑定与数据均保持不变.
        expect((select as any)._currCtrlId).toBe(STALE_CTRL_ID);
        expect((select as any)._ctrlData[STALE_CTRL_ID]).toEqual({ 0: { keep: 1 } });
    });
});

describe("StateSelectV2.rebindController — CC_EDITOR=false", () => {
    it("非编辑器态直接返回, 不动任何状态", () => {
        const { select } = setupCtrlAndSelect();
        (select as any)._currCtrlId = STALE_CTRL_ID;
        (select as any)._ctrlData = { [STALE_CTRL_ID]: { 0: { keep: 1 } } };

        (globalThis as any).CC_EDITOR = false;
        try {
            select.rebindController();
        }
        finally {
            (globalThis as any).CC_EDITOR = true;
        }

        expect((select as any)._currCtrlId).toBe(STALE_CTRL_ID);
        expect((select as any)._ctrlData[STALE_CTRL_ID]).toEqual({ 0: { keep: 1 } });
    });
});
