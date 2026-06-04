/**
 * 单 StateControllerV2 下多个 StateSelectV2 同时被控制 (红测试复现 bug)
 *
 * 用户报告: 状态控制器只对**第一个 StateSelectV2 生效**, 之后的 StateSelectV2
 * 切换 state 时不被 apply (值可能保存但不应用到节点).
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

function setupCtrlWithMultiSelect(count: number) {
    const ccL = (globalThis as any).cc;
    const root = new ccL.Node("MS_Root");
    const ctrlNode = new ccL.Node("MS_Ctrl");
    root.addChild(ctrlNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();

    // 模拟 cocos 编辑器真实时序: 用户加一个 select, ctrl 可能因切 state 触发
    // 一次 rebuildStateSelectCache (清空 _cacheDirty), 然后用户加第二个 select.
    // 不显式 markCacheDirty —— 依赖 select.__preload 内的 notifyControllerCacheDirty
    // 正常工作 (这是 bug 现场: 它在 currCtrlId 设置前调用, getCurrCtrl 返回 undefined,
    // markCacheDirty 不被调).
    const selects: { node: any; select: any }[] = [];
    for (let i = 0; i < count; i++) {
        const sn = new ccL.Node(`MS_Select_${i}`);
        ctrlNode.addChild(sn);
        const ss = sn.addComponent(StateSelectV2);
        (ss as any).__preload();
        selects.push({ node: sn, select: ss });

        // 第一个 select 加完后, 主动让 ctrl rebuild 一次 (模拟用户切 state),
        // 让 _cacheDirty 变 false. 然后再加第 2 / 3 个 select 才能触发 bug.
        if (i === 0) {
            (ctrl as any).rebuildStateSelectCache();
        }
    }

    return { root, ctrlNode, ctrl, selects };
}

describe("单 ctrl 多 select round-trip (用户报告 bug)", () => {
    it("rebuildStateSelectCache 应缓存所有直辖 select", () => {
        const { ctrl, selects } = setupCtrlWithMultiSelect(3);
        (ctrl as any).rebuildStateSelectCache();
        const cache = (ctrl as any)._stateSelectCache;
        expect(cache.length).toBe(3);
        for (const { select } of selects) {
            expect(cache).toContain(select);
        }
    });

    it("3 个 select 都启用 Opacity 受控, 切 state 时每个 select 都应被 apply", () => {
        const { ctrl, selects } = setupCtrlWithMultiSelect(3);

        // 每个 select 在 state 0 各设独立 opacity
        ctrl.selectedIndex = 0;
        for (let i = 0; i < selects.length; i++) {
            selects[i].select.togglePropertyControl(EnumPropName.Opacity, true);
            selects[i].node.opacity = 50 + i * 30; // 50, 80, 110
            (selects[i].select as any).setDefaultProp(EnumPropName.Opacity);
        }

        // state 1 各设另一组 opacity
        ctrl.selectedIndex = 1;
        for (let i = 0; i < selects.length; i++) {
            selects[i].select.togglePropertyControl(EnumPropName.Opacity, true);
            selects[i].node.opacity = 150 + i * 30; // 150, 180, 210
            (selects[i].select as any).setDefaultProp(EnumPropName.Opacity);
        }

        // 切回 state 0, 期望每个 select 的 opacity 都恢复为对应 state 0 值
        ctrl.selectedIndex = 0;
        expect(selects[0].node.opacity).toBe(50);
        expect(selects[1].node.opacity).toBe(80);
        expect(selects[2].node.opacity).toBe(110);

        // 切到 state 1
        ctrl.selectedIndex = 1;
        expect(selects[0].node.opacity).toBe(150);
        expect(selects[1].node.opacity).toBe(180);
        expect(selects[2].node.opacity).toBe(210);
    });
});
