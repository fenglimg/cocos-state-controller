/**
 * TASK-006 (专项A-2): StateSelectV2 单节点各 state 值 swap/copy/move 局部操作.
 *
 * 设计 (SPEC 专项A / line 236): 节点级局部值便捷操作 —— 把单节点某 state 的值数据
 * 与相邻 state 的值数据 交换/复制/移动. 只动 _ctrlData[ctrlId][stateKey] 的 propData,
 * 不碰 selectedIndex、不影响其他节点的 _ctrlData、不增删 state 数量结构.
 *
 * 与 StateControllerV2 的 move/dup/delete (操作整个 State 列表, 影响所有节点) 语义不同:
 * 这里是单节点局部数据搬运 (如 swap A1↔B1 / copy A1→B1).
 *
 * 真 cocos 引擎集成测试. 本测试覆盖数据正确性; 编辑器 dogfood (T8) 另行取证.
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
const { StateControllerV2, StateValue } = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelectV2 } = require("../../assets/script/controller/StateSelectV2");

function setup() {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("LSV_Root");
    const ctrlNode = new ccL.Node("LSV_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("LSV_SelectNode");
    ctrlNode.addChild(selectNode);
    const otherNode = new ccL.Node("LSV_OtherNode");
    ctrlNode.addChild(otherNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();
    // 3 个 state: A(0) / B(1) / C(2)
    ctrl.states = [
        StateValue.create("A", (ctrl as any).stateIdAuto++),
        StateValue.create("B", (ctrl as any).stateIdAuto++),
        StateValue.create("C", (ctrl as any).stateIdAuto++),
    ];

    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();
    const other = otherNode.addComponent(StateSelectV2);
    (other as any).__preload();
    (ctrl as any).markCacheDirty();

    return { ccL, root, ctrl, select, other };
}

/** 直接在 _ctrlData[ctrlId] 写入指定 state 槽位的 propData (值级测试用). */
function seedPage(sel: any, ctrlId: number, byState: { [idx: number]: any }) {
    const page = sel._ctrlData[ctrlId] || (sel._ctrlData[ctrlId] = {});
    for (const k of Object.keys(byState)) {
        page[k] = byState[k as any];
    }
    return page;
}

describe("专项A-2 StateSelectV2 单节点各 state 值 swap/copy/move", () => {
    it("swapStateValues: A1↔B1 值互换, 不动其他 state/节点/selectedIndex/state数量", () => {
        const { ctrl, select, other } = setup();
        const cid = ctrl.ctrlId;
        seedPage(select, cid, {
            0: { "cc.Node.opacity": 100 },
            1: { "cc.Node.opacity": 200 },
            2: { "cc.Node.opacity": 255 },
        });
        seedPage(other, cid, { 0: { "cc.Node.opacity": 11 }, 1: { "cc.Node.opacity": 22 } });
        ctrl.selectedIndex = 0;

        const ok = select.swapStateValues(0, 1, cid);
        expect(ok).toBe(true);

        const page = (select as any)._ctrlData[cid];
        expect(page[0]["cc.Node.opacity"]).toBe(200);
        expect(page[1]["cc.Node.opacity"]).toBe(100);
        // C 槽不动
        expect(page[2]["cc.Node.opacity"]).toBe(255);
        // 其他节点不污染
        expect((other as any)._ctrlData[cid][0]["cc.Node.opacity"]).toBe(11);
        expect((other as any)._ctrlData[cid][1]["cc.Node.opacity"]).toBe(22);
        // selectedIndex 不变, state 数量不变
        expect(ctrl.selectedIndex).toBe(0);
        expect(ctrl.states.length).toBe(3);
    });

    it("copyStateValues: A1→B1 深拷覆盖, 源与目标独立 (改一个不影响另一个)", () => {
        const { ctrl, select } = setup();
        const cid = ctrl.ctrlId;
        seedPage(select, cid, {
            0: { "cc.Node.x": 10, "cc.Node.y": 20 },
            1: { "cc.Node.x": 99 },
        });

        const ok = select.copyStateValues(0, 1, cid);
        expect(ok).toBe(true);

        const page = (select as any)._ctrlData[cid];
        expect(page[1]).toEqual({ "cc.Node.x": 10, "cc.Node.y": 20 });
        // 深拷独立: 改目标不影响源
        page[1]["cc.Node.x"] = -1;
        expect(page[0]["cc.Node.x"]).toBe(10);
        // 源仍在
        expect(page[0]).toEqual({ "cc.Node.x": 10, "cc.Node.y": 20 });
        expect(ctrl.states.length).toBe(3);
    });

    it("越界 state index 被拒 (返回 false, 不破坏数据)", () => {
        const { ctrl, select } = setup();
        const cid = ctrl.ctrlId;
        seedPage(select, cid, { 0: { "cc.Node.opacity": 100 } });
        expect(select.swapStateValues(0, 9, cid)).toBe(false);
        expect(select.copyStateValues(-1, 0, cid)).toBe(false);
        // 数据未动
        expect((select as any)._ctrlData[cid][0]["cc.Node.opacity"]).toBe(100);
    });

    it("from===to 为 noop (不丢数据)", () => {
        const { ctrl, select } = setup();
        const cid = ctrl.ctrlId;
        seedPage(select, cid, { 1: { "cc.Node.opacity": 123 } });
        expect(select.copyStateValues(1, 1, cid)).toBe(true);
        expect((select as any)._ctrlData[cid][1]["cc.Node.opacity"]).toBe(123);
    });

    describe("inspector 触发器入口 (current↔next)", () => {
        const DELIMETER = "$_$";
        function getVisibleAttr(ctor: any, key: string) {
            const attrs = (globalThis as any).cc.Class.Attr.getClassAttrs(ctor);
            return attrs[key + DELIMETER + "visible"];
        }

        for (const key of ["swapValueWithNext", "copyValueToNext"]) {
            it(`[${key}] @property 对 inspector 可见 (visible !== false)`, () => {
                expect(getVisibleAttr(StateSelectV2, key)).not.toBe(false);
            });
        }

        it("swapValueWithNext: 当前 state 值与下一 state 值互换", () => {
            const { ctrl, select } = setup();
            const cid = ctrl.ctrlId;
            seedPage(select, cid, { 0: { "cc.Node.opacity": 100 }, 1: { "cc.Node.opacity": 200 } });
            ctrl.selectedIndex = 0;
            select.swapValueWithNext = true;
            const page = (select as any)._ctrlData[cid];
            expect(page[0]["cc.Node.opacity"]).toBe(200);
            expect(page[1]["cc.Node.opacity"]).toBe(100);
            expect(ctrl.selectedIndex).toBe(0);
        });

        it("copyValueToNext: 当前 state 值深拷到下一 state", () => {
            const { ctrl, select } = setup();
            const cid = ctrl.ctrlId;
            seedPage(select, cid, { 0: { "cc.Node.x": 7 }, 1: { "cc.Node.x": 0 } });
            ctrl.selectedIndex = 0;
            select.copyValueToNext = true;
            const page = (select as any)._ctrlData[cid];
            expect(page[1]).toEqual({ "cc.Node.x": 7 });
        });

        it("最后一个 state 触发 next 操作为安全 noop (无下一 state)", () => {
            const { ctrl, select } = setup();
            const cid = ctrl.ctrlId;
            seedPage(select, cid, { 2: { "cc.Node.opacity": 50 } });
            ctrl.selectedIndex = 2; // 最后一个
            select.swapValueWithNext = true; // 无 next, noop
            expect((select as any)._ctrlData[cid][2]["cc.Node.opacity"]).toBe(50);
        });
    });
});

export {};
