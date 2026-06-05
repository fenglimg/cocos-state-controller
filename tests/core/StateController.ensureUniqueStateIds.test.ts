/**
 * StateController stateId 去重修复测试
 *
 * 背景: 部分历史 prefab (如 MentorActionPanelModal) 的 state 名字各异但 stateId 全为 0(未分配)
 * 或存在重复, 导致「按 stateId 切换 / 跨控制器联动定位」落到首个匹配 state → 无法切换。
 * ensureUniqueStateIds (在 __preload 内调用) 必须把这类数据修复为唯一 stateId, 且对正常数据幂等。
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
const { StateController, StateValue } = ControllerMod;

function makeCtrl() {
    const ccL = (globalThis as any).cc;
    const node = new ccL.Node("UniqueId_CtrlNode");
    const ctrl = node.addComponent(StateController);
    (ctrl as any).__preload();
    return ctrl;
}

describe("ensureUniqueStateIds", () => {
    it("名字各异但 stateId 全为 0 → 修复为唯一", () => {
        const ctrl = makeCtrl();
        // 模拟历史数据: 直接铺设 _states (绕过 setter), stateId 全 0
        (ctrl as any)._states = [
            StateValue.create("未拜师", 0),
            StateValue.create("拜师中", 0),
            StateValue.create("拜师申请", 0),
        ];
        (ctrl as any).stateIdAuto = 0;

        (ctrl as any).ensureUniqueStateIds();

        const ids = (ctrl as any)._states.map((s: any) => s.stateId);
        expect(new Set(ids).size).toBe(ids.length);
        // 首个合法 id(0) 保留, 其余顺延
        expect(ids[0]).toBe(0);
    });

    it("存在重复 stateId → 仅重复项重新分配, 不撞已有 id", () => {
        const ctrl = makeCtrl();
        (ctrl as any)._states = [
            StateValue.create("a", 3),
            StateValue.create("b", 3),
            StateValue.create("c", 5),
        ];
        (ctrl as any).stateIdAuto = 0;

        (ctrl as any).ensureUniqueStateIds();

        const ids = (ctrl as any)._states.map((s: any) => s.stateId);
        expect(new Set(ids).size).toBe(3);
        expect(ids[0]).toBe(3);   // 首个保留
        expect(ids[2]).toBe(5);   // 未重复的保留
        expect(ids[1]).not.toBe(3);
        // stateIdAuto 必须领先于现存最大 id, 后续新增不撞车
        expect((ctrl as any).stateIdAuto).toBeGreaterThan(5);
    });

    it("已唯一数据 → 幂等, 不改 id 也不动 stateIdAuto", () => {
        const ctrl = makeCtrl();
        (ctrl as any)._states = [StateValue.create("a", 5), StateValue.create("b", 7)];
        (ctrl as any).stateIdAuto = 8;

        (ctrl as any).ensureUniqueStateIds();

        expect((ctrl as any)._states.map((s: any) => s.stateId)).toEqual([5, 7]);
        expect((ctrl as any).stateIdAuto).toBe(8);
    });
});
