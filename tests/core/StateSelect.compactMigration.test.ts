/**
 * Track1 迁移验证: compactCtrlData 把 fat _ctrlData 规范化为 compact, 且 apply 等价。
 *
 * 锁定不变量:
 *   (1) 迁移后各 state 不再内联 $$controlledProps$$ (受控集只在 $$default$$);
 *   (2) 迁移后各 state 只保留与 default 不同的 override (等于 default 的值被删);
 *   (3) 迁移前后逐 state apply 到节点的终态完全一致 (fat==compact, 行为零变更);
 *   (4) 体积显著下降。
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
const X = "cc.Node.x";

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

    while ((ctrl as any)._states.length < stateCount) {
        const ns = (ctrl as any)._states.slice();
        ns.push(StateValue.create("s" + ns.length, (ctrl as any).stateIdAuto++));
        ctrl.states = ns;
    }
    const stateIds: number[] = ctrl.states.map((s: any) => s.stateId);
    (select as any)._currCtrlId = ctrl.ctrlId;
    return { ctrl, select, selectNode, stateIds };
}

/** 构造一份 fat 数据: default + 每个 state 都内联完整 cp + 全量值 (active/opacity/x), 仅个别 state 改值。 */
function buildFat(stateIds: number[]) {
    const cp = { [ACTIVE]: ACTIVE, [OPACITY]: OPACITY, [X]: X };
    const full = (active: boolean, opacity: number, x: number) => ({
        $$controlledProps$$: { ...cp },
        [ACTIVE]: active, [OPACITY]: opacity, [X]: x,
    });
    return {
        $$stateKeyMode$$: "stateId",
        $$default$$: full(true, 255, 0),
        [stateIds[0]]: full(true, 255, 0),    // 全等 default → 迁移后应空
        [stateIds[1]]: full(false, 255, 0),   // 仅 active 不同
        [stateIds[2]]: full(true, 100, 0),    // 仅 opacity 不同
    };
}

/** 逐 state 切换, 收集节点终态 (active/opacity/x)。 */
function applySnapshot(ctrl: any, selectNode: any, stateIds: number[]) {
    const out: Array<[boolean, number, number]> = [];
    for (let i = 0; i < stateIds.length; i++) {
        // 强制重新 apply: 先切到别的 index 再切回 (setter 对相同值早退)
        ctrl.selectedIndex = (i + 1) % stateIds.length;
        ctrl.selectedIndex = i;
        out.push([selectNode.active, selectNode.opacity, selectNode.x]);
    }
    return out;
}

describe("Track1 compactCtrlData 迁移 + apply 等价", () => {
    it("迁移后 state 去内联 cp、只留 override, 且 apply 与 fat 完全一致", () => {
        // ---- fat: 注入并记录 apply 终态 ----
        const fatEnv = setup(3);
        (fatEnv.select as any)._ctrlData[fatEnv.ctrl.ctrlId] = buildFat(fatEnv.stateIds);
        const fatSnap = applySnapshot(fatEnv.ctrl, fatEnv.selectNode, fatEnv.stateIds);
        const fatSize = JSON.stringify((fatEnv.select as any)._ctrlData[fatEnv.ctrl.ctrlId]).length;

        // ---- compact: 注入同样 fat, 跑 compactCtrlData, 记录 apply 终态 ----
        const cmpEnv = setup(3);
        cmpEnv.select._ctrlData = cmpEnv.select._ctrlData || {};
        (cmpEnv.select as any)._ctrlData[cmpEnv.ctrl.ctrlId] = buildFat(cmpEnv.stateIds);
        (cmpEnv.select as any).compactCtrlData();
        const page = (cmpEnv.select as any)._ctrlData[cmpEnv.ctrl.ctrlId];

        // 不变量 (1): state 不再内联 cp
        for (const id of cmpEnv.stateIds) {
            expect(page[id].$$controlledProps$$).toBeUndefined();
        }
        // 不变量 (2): state0 全等 default → 空; state1 只剩 active; state2 只剩 opacity
        const ownKeys = (o: any) => Object.keys(o).filter(k => !k.startsWith("$$"));
        expect(ownKeys(page[cmpEnv.stateIds[0]])).toEqual([]);
        expect(ownKeys(page[cmpEnv.stateIds[1]])).toEqual([ACTIVE]);
        expect(ownKeys(page[cmpEnv.stateIds[2]])).toEqual([OPACITY]);
        // default 仍是权威 schema + baseline
        expect(page.$$default$$.$$controlledProps$$[ACTIVE]).toBeDefined();

        const cmpSnap = applySnapshot(cmpEnv.ctrl, cmpEnv.selectNode, cmpEnv.stateIds);
        const cmpSize = JSON.stringify(page).length;

        // 不变量 (3): apply 终态完全一致
        expect(cmpSnap).toEqual(fatSnap);
        // 不变量 (4): 体积显著下降
        expect(cmpSize).toBeLessThan(fatSize);
        // eslint-disable-next-line no-console
        console.log(`[compactMigration] fat=${fatSize} → compact=${cmpSize} (${Math.round((1 - cmpSize / fatSize) * 100)}% 降)`);
    });

    it("compactCtrlData 幂等: compact 数据再跑不变", () => {
        const env = setup(3);
        (env.select as any)._ctrlData[env.ctrl.ctrlId] = buildFat(env.stateIds);
        (env.select as any).compactCtrlData();
        const once = JSON.stringify((env.select as any)._ctrlData[env.ctrl.ctrlId]);
        (env.select as any).compactCtrlData();
        const twice = JSON.stringify((env.select as any)._ctrlData[env.ctrl.ctrlId]);
        expect(twice).toEqual(once);
    });
});
