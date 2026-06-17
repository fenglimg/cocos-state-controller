/**
 * Phase 0 安全网 oracle — 老「数字 key」(EnumPropName) ctrlData 的 apply 行为锚点。
 *
 * 背景: T2「X方案」后, 全链路产出的数据都是 propRef 字符串 key (cc.Node.active 等),
 *   数字 key 仅可能残留在 X方案前存盘、之后再没重存/没跑 migrator 的老 prefab 里。
 *   当前 apply 仍能吃数字 key: applyDataToNode → extractEnumPropTypes(只认 /^\d+$/)
 *   → batchUpdateUI → PropHandlerManager.setValue (ENUM 轨)。
 *
 * 本测试**锁定**真实生产流程: 注入纯数字 key 的 _ctrlData → 调 migrateLegacyCtrlData()
 *   (模拟编辑器加载老 .fire 时 __preload:624 的 lazy 自愈迁移) → 切 state apply 正确。
 *   - migrateLegacyCtrlData 已存在且已 wire 进 __preload: 数字 key 在加载瞬间转 propRef,
 *     ENUM apply 轨在真实流程里根本不触发。本 oracle 走的就是迁移后的 propRef 单轨。
 *   - 这是 Phase 3「删 ENUM 轨 + PropHandlerManager」的正确性 oracle: 删旧路后须保持绿。
 *
 * 覆盖三类风险面:
 *   - 标量:   Active(1) / Opacity(11)
 *   - 需 clone 复合: Color(10)  (PropHandler 特化 clone 路径)
 *   - 聚合(最险): Position(2) 整存 Vec3  (老路整体写 node.position, 非 x/y/z 子项)
 *
 * 不变量 (default: active=true, opacity=200, color=white, pos=(0,0,0)):
 *   index0 (无 override) → 全 default
 *   index1 (active=false) → active=false, 余 default
 *   index2 (opacity=100, color=red, pos=(50,60,0)) → 这三项 override, active=default(true)
 *   回切 index1 → active=false, 余三项由 default 还原
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

// EnumPropName 数字常量 (老 key 形态)
const K_ACTIVE = 1;
const K_POSITION = 2;
const K_COLOR = 10;
const K_OPACITY = 11;

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
    // 直注数据, 绕过 togglePropertyControl (模拟从磁盘读入的老数据)
    (select as any)._currCtrlId = ctrl.ctrlId;

    return { root, ctrlNode, selectNode, ctrl, select, stateIds };
}

describe("Phase0 oracle: 老数字 key ctrlData apply 等价", () => {
    it("标量 Active(1)+Opacity(11): 切 state apply 正确", () => {
        const { ctrl, select, selectNode, stateIds } = setup(3);
        (select as any)._ctrlData[ctrl.ctrlId] = {
            $$stateKeyMode$$: "stateId",
            $$default$$: { [K_ACTIVE]: true, [K_OPACITY]: 200 },
            [stateIds[0]]: {},
            [stateIds[1]]: { [K_ACTIVE]: false },
            [stateIds[2]]: { [K_OPACITY]: 100 },
        };
        (select as any).migrateLegacyCtrlData(); // 模拟加载老 .fire 的迁移
        ctrl.selectedIndex = 0;
        expect(selectNode.active).toBe(true);
        expect(selectNode.opacity).toBe(200);

        ctrl.selectedIndex = 1;
        expect(selectNode.active).toBe(false);
        expect(selectNode.opacity).toBe(200);

        ctrl.selectedIndex = 2;
        expect(selectNode.active).toBe(true);
        expect(selectNode.opacity).toBe(100);

        ctrl.selectedIndex = 1; // 回切: opacity 由 default 还原
        expect(selectNode.active).toBe(false);
        expect(selectNode.opacity).toBe(200);
    });

    it("需 clone 复合 Color(10): 切 state apply 正确 + default 还原", () => {
        const ccLocal = (globalThis as any).cc;
        const { ctrl, select, selectNode, stateIds } = setup(2);
        (select as any)._ctrlData[ctrl.ctrlId] = {
            $$stateKeyMode$$: "stateId",
            $$default$$: { [K_COLOR]: ccLocal.color(255, 255, 255, 255) },
            [stateIds[0]]: {},
            [stateIds[1]]: { [K_COLOR]: ccLocal.color(255, 0, 0, 255) },
        };
        (select as any).migrateLegacyCtrlData(); // 模拟加载老 .fire 的迁移
        ctrl.selectedIndex = 0;
        expect(selectNode.color.r).toBe(255);
        expect(selectNode.color.g).toBe(255);

        ctrl.selectedIndex = 1;
        expect(selectNode.color.r).toBe(255);
        expect(selectNode.color.g).toBe(0);
        expect(selectNode.color.b).toBe(0);

        ctrl.selectedIndex = 0; // 回切: color 由 default 还原为白
        expect(selectNode.color.g).toBe(255);
        expect(selectNode.color.b).toBe(255);
    });

    it("聚合 Position(2) 整存 Vec3: 切 state apply 正确 + default 还原", () => {
        const ccLocal = (globalThis as any).cc;
        const { ctrl, select, selectNode, stateIds } = setup(2);
        (select as any)._ctrlData[ctrl.ctrlId] = {
            $$stateKeyMode$$: "stateId",
            $$default$$: { [K_POSITION]: ccLocal.v3(0, 0, 0) },
            [stateIds[0]]: {},
            [stateIds[1]]: { [K_POSITION]: ccLocal.v3(50, 60, 0) },
        };
        (select as any).migrateLegacyCtrlData(); // 模拟加载老 .fire 的迁移
        ctrl.selectedIndex = 0;
        expect(selectNode.position.x).toBe(0);
        expect(selectNode.position.y).toBe(0);

        ctrl.selectedIndex = 1;
        expect(selectNode.position.x).toBe(50);
        expect(selectNode.position.y).toBe(60);

        ctrl.selectedIndex = 0; // 回切: position 由 default 还原为原点
        expect(selectNode.position.x).toBe(0);
        expect(selectNode.position.y).toBe(0);
    });
});

export {};
