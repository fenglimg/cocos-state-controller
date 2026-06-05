/**
 * Track1 行为不变 oracle (序列化瘦身前置基线)
 *
 * 目的: 锁定一个"两种磁盘格式 apply 等价"的不变量, 供 Track1 各阶段回归:
 *   - FAT 格式 (当前 prefab 落盘): 每个 state 内联完整 $$controlledProps$$ 自映射 + 全量属性值
 *     (auto-opt-in 的 togglePropertyControlByPropRefAllStates 给每个 state 都种了 schema+baseline)。
 *   - COMPACT 格式 (Track1 目标): 仅 $$default$$ 持 schema + baseline; 各 state 只存"与 default 不同的 override",
 *     无 per-state $$controlledProps$$, 无等于 default 的值。
 *
 * 关键假设 (本测试验证): apply 读路径**本来就**支持 COMPACT —
 *   - 值解析 state→default 兜底 (StateSelectV2 applyDataToNode:2777 / readPropByEnum:1163 先读 propRef key)
 *   - applyPropRefKeysToNode:2885 "controlledProps 缺失 → apply all" 向后兼容分支
 * 若 COMPACT describe 在当前代码即通过, 则读侧零改动, Track1 收敛为"写侧 + 迁移"。
 *
 * 不变量 (default: active=true, opacity=200):
 *   index0 (无 override)      → active=true,  opacity=200
 *   index1 (active=false)     → active=false, opacity=200
 *   index2 (opacity=100)      → active=true,  opacity=100
 *   回切 index1               → active=false, opacity=200  (state 间隔离 + default 还原 opacity)
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

const { StateController, StateValue } = ControllerMod;
const { StateSelect } = SelectMod;

const ACTIVE = "cc.Node.active";
const OPACITY = "cc.Node.opacity";

function setup(stateCount: number) {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateController);
    (ctrl as any).__preload();

    const select = selectNode.addComponent(StateSelect);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();

    // 扩到 stateCount 个 state, stateId 由工厂分配
    while ((ctrl as any)._states.length < stateCount) {
        const ns = (ctrl as any)._states.slice();
        ns.push(StateValue.create("s" + ns.length, (ctrl as any).stateIdAuto++));
        ctrl.states = ns;
    }
    const stateIds: number[] = ctrl.states.map((s: any) => s.stateId);
    // 绑定 select 的当前 ctrl (绕过 togglePropertyControl 直注数据, 需手动 wire)
    (select as any)._currCtrlId = ctrl.ctrlId;

    return { root, ctrlNode, selectNode, ctrl, select, stateIds };
}

/** 跨 state 切换并断言不变量 */
function assertInvariant(ctrl: any, selectNode: any) {
    // 注: active 关掉后再切, 验证 inactive select 仍收 apply (active.test 同款契约)
    ctrl.selectedIndex = 0;
    expect(selectNode.active).toBe(true);
    expect(selectNode.opacity).toBe(200);

    ctrl.selectedIndex = 1;
    expect(selectNode.active).toBe(false);
    expect(selectNode.opacity).toBe(200);

    ctrl.selectedIndex = 2;
    expect(selectNode.active).toBe(true);
    expect(selectNode.opacity).toBe(100);

    // 回切 state1: opacity 必须由 default 还原回 200, active 回 false
    ctrl.selectedIndex = 1;
    expect(selectNode.active).toBe(false);
    expect(selectNode.opacity).toBe(200);
}

describe("Track1 序列化格式 apply 等价 oracle", () => {
    it("FAT 格式 (当前落盘: per-state schema + 全量值) apply 正确", () => {
        const { ctrl, select, selectNode, stateIds } = setup(3);
        const cp = { [ACTIVE]: ACTIVE, [OPACITY]: OPACITY };
        const fullState = (active: boolean, opacity: number) => ({
            $$controlledProps$$: { ...cp },
            [ACTIVE]: active,
            [OPACITY]: opacity,
        });
        (select as any)._ctrlData[ctrl.ctrlId] = {
            $$stateKeyMode$$: "stateId",
            $$default$$: fullState(true, 200),
            [stateIds[0]]: fullState(true, 200),
            [stateIds[1]]: fullState(false, 200),
            [stateIds[2]]: fullState(true, 100),
        };

        assertInvariant(ctrl, selectNode);
    });

    it("COMPACT 格式 (default 持 schema+baseline, state 仅存 override) apply 等价", () => {
        const { ctrl, select, selectNode, stateIds } = setup(3);
        (select as any)._ctrlData[ctrl.ctrlId] = {
            $$stateKeyMode$$: "stateId",
            $$default$$: {
                $$controlledProps$$: { [ACTIVE]: ACTIVE, [OPACITY]: OPACITY },
                [ACTIVE]: true,
                [OPACITY]: 200,
            },
            [stateIds[0]]: {}, // 无 override
            [stateIds[1]]: { [ACTIVE]: false }, // 仅 active override
            [stateIds[2]]: { [OPACITY]: 100 }, // 仅 opacity override
        };

        assertInvariant(ctrl, selectNode);
    });
});
