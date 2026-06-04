/**
 * Round1 #C5 (+D1): updateStateCopy / copyStateValues 深拷必须保活 cc 类实例.
 *
 * 根因: propData 值经 cloneValueByType 存为活 cc.Color/Vec3/Vec2/Size/Quat 实例(StateSelectV2:818);
 * 但 updateStateCopy(:1600) / copyStateValues 用 JSON.parse(JSON.stringify) 深拷 → 降级成普通
 * {r,g,b,a} 对象 → apply 时 cloneValueByType 对普通对象 instanceof 不命中 → 原样写回节点 → 类型退化.
 * 修复: 逐 key 走 cloneValueByType 深拷(按 cocosType 分发), 保留类实例 + 仍独立.
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
const { StateControllerV2, StateValue } = require("../../assets/script/controller/StateControllerV2");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelectV2 } = require("../../assets/script/controller/StateSelectV2");

const ccL = (globalThis as any).cc;
const ccclass = ccL._decorator.ccclass;
const property = ccL._decorator.property;

@ccclass("ColorCloneFixture")
class ColorCloneFixture extends ccL.Component {
    @property(ccL.Color) public tint: cc.Color = ccL.Color.WHITE;
    @property(ccL.Vec3) public pivot: cc.Vec3 = ccL.v3(0, 0, 0);
}

function setup(stateCount = 3) {
    const root = new ccL.Node("CC_Root");
    const ctrlNode = new ccL.Node("CC_CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccL.Node("CC_SelectNode");
    ctrlNode.addChild(selectNode);
    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();
    selectNode.addComponent(ColorCloneFixture);
    const select = selectNode.addComponent(StateSelectV2);
    (select as any).__preload();
    (ctrl as any).markCacheDirty();
    while ((ctrl as any)._states.length < stateCount) {
        const ns = (ctrl as any)._states.slice();
        ns.push(StateValue.create("S" + ns.length, (ctrl as any).stateIdAuto++));
        ctrl.states = ns;
    }
    return { ctrl, select, selectNode };
}

const COLOR_REF = "ColorCloneFixture.tint";
const VEC_REF = "ColorCloneFixture.pivot";

describe("#C5 copy/clone 保活 cc 类实例", () => {
    it("copyStateValues: cc.Color 值复制后仍 instanceof cc.Color (非普通对象)", () => {
        const { ctrl, select } = setup();
        const cid = ctrl.ctrlId;
        const page = (select as any)._ctrlData[cid];
        page[0] = page[0] || {};
        page[0][COLOR_REF] = ccL.color(255, 100, 50, 255);
        page[0][VEC_REF] = ccL.v3(1, 2, 3);

        select.copyStateValues(0, 1, cid);

        const copied = page[1][COLOR_REF];
        expect(copied instanceof ccL.Color).toBe(true);
        expect(copied.r).toBe(255);
        expect(copied.g).toBe(100);
        const copiedVec = page[1][VEC_REF];
        expect(copiedVec instanceof ccL.Vec3).toBe(true);
        expect(copiedVec.x).toBe(1);

        // 独立: 改副本不影响源
        copied.r = 0;
        expect(page[0][COLOR_REF].r).toBe(255);
    });

    it("updateStateCopy: cc.Color 值深拷后仍 instanceof cc.Color", () => {
        const { ctrl, select } = setup();
        const cid = ctrl.ctrlId;
        const page = (select as any)._ctrlData[cid];
        page[0] = { [COLOR_REF]: ccL.color(10, 20, 30, 40) };

        (select as any).updateStateCopy(ctrl, { fromIndex: 0, toIndex: 1 });

        const copied = page[1][COLOR_REF];
        expect(copied instanceof ccL.Color).toBe(true);
        expect(copied.r).toBe(10);
    });

    it("swapStateValues: 交换后两侧都保持 cc 类实例", () => {
        const { ctrl, select } = setup();
        const cid = ctrl.ctrlId;
        const page = (select as any)._ctrlData[cid];
        page[0] = { [COLOR_REF]: ccL.color(1, 1, 1, 1) };
        page[1] = { [COLOR_REF]: ccL.color(2, 2, 2, 2) };

        select.swapStateValues(0, 1, cid);
        expect(page[0][COLOR_REF] instanceof ccL.Color).toBe(true);
        expect(page[1][COLOR_REF] instanceof ccL.Color).toBe(true);
        expect(page[0][COLOR_REF].r).toBe(2);
        expect(page[1][COLOR_REF].r).toBe(1);
    });
});

export {};
