/**
 * HomePageCapability 接入契约 (Wave 3 T03-T04)
 *
 * 设计师在编辑器把某个 state 标为 "home", runtime 启动时自动跳到 home state.
 *
 *   HomePageCapability.setHomePage(ctrl, stateIdOrName | -1)  // -1 清除
 *   HomePageCapability.getHomePage(ctrl) → stateId | -1
 *   HomePageCapability.getHomePageIndex(ctrl) → index | -1   // 当前 _states[] 里 home 的下标
 *
 * 数据持久化: StateController 加 `_homePageStateId` @property visible:false (默认 -1).
 * 用 stateId 而不是 index, 这样 reorder/delete 后 home 还跟着对应的 state.
 *
 * runtime onLoad 自动 apply: 通过 capability hook `onRuntimeInit` 路径
 * (StateController.onLoad runtime path 加一行 dispatch).
 *
 * 红预期: HomePageCapability 模块不存在 / StateController 没 _homePageStateId 字段.
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
const { StateController } = require("../../assets/script/controller/StateController");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StateSelect } = require("../../assets/script/controller/StateSelect");

function setupCtrl() {
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

    return { ctrl, select };
}

describe("HomePageCapability (Wave 3 T03)", () => {
    it("模块存在 + name = homePage + 已注册到 Registry", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Mod = require("../../assets/script/controller/capabilities/HomePageCapability");
        expect(Mod.HomePageCapability).toBeDefined();
        expect(Mod.HomePageCapability.name).toBe("homePage");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        expect(CapabilityRegistry.get("homePage")).toBeDefined();
    });

    it("默认 getHomePage(ctrl) === -1 (未设置)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { HomePageCapability } = require("../../assets/script/controller/capabilities/HomePageCapability");
        const { ctrl } = setupCtrl();
        expect(HomePageCapability.getHomePage(ctrl)).toBe(-1);
        expect(HomePageCapability.getHomePageIndex(ctrl)).toBe(-1);
    });

    it("setHomePage(ctrl, stateId) → getHomePage 返回该 stateId", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { HomePageCapability } = require("../../assets/script/controller/capabilities/HomePageCapability");
        const { ctrl } = setupCtrl();
        const targetStateId = ctrl._states[1].stateId;
        HomePageCapability.setHomePage(ctrl, targetStateId);
        expect(HomePageCapability.getHomePage(ctrl)).toBe(targetStateId);
        expect(HomePageCapability.getHomePageIndex(ctrl)).toBe(1);
    });

    it("setHomePage(ctrl, stateName) 接受 name, 自动找 stateId", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { HomePageCapability } = require("../../assets/script/controller/capabilities/HomePageCapability");
        const { ctrl } = setupCtrl();
        const target = ctrl._states[1];
        HomePageCapability.setHomePage(ctrl, target.name); // "2"
        expect(HomePageCapability.getHomePage(ctrl)).toBe(target.stateId);
    });

    it("setHomePage(ctrl, -1) 清除", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { HomePageCapability } = require("../../assets/script/controller/capabilities/HomePageCapability");
        const { ctrl } = setupCtrl();
        HomePageCapability.setHomePage(ctrl, ctrl._states[1].stateId);
        HomePageCapability.setHomePage(ctrl, -1);
        expect(HomePageCapability.getHomePage(ctrl)).toBe(-1);
    });

    it("setHomePage 不存在的 stateId/name → 不抛, 保持原值", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { HomePageCapability } = require("../../assets/script/controller/capabilities/HomePageCapability");
        const { ctrl } = setupCtrl();
        const valid = ctrl._states[0].stateId;
        HomePageCapability.setHomePage(ctrl, valid);
        expect(() => HomePageCapability.setHomePage(ctrl, 9999)).not.toThrow();
        expect(() => HomePageCapability.setHomePage(ctrl, "nonexistent")).not.toThrow();
        expect(HomePageCapability.getHomePage(ctrl)).toBe(valid);
    });

    it("reorder 后, getHomePageIndex 跟随 stateId 自动更新", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { HomePageCapability } = require("../../assets/script/controller/capabilities/HomePageCapability");
        const { ctrl } = setupCtrl();
        const target = ctrl._states[1];
        HomePageCapability.setHomePage(ctrl, target.stateId);
        expect(HomePageCapability.getHomePageIndex(ctrl)).toBe(1);

        // 交换两个 state
        const newStates = [ctrl._states[1], ctrl._states[0]];
        ctrl.states = newStates;
        expect(HomePageCapability.getHomePageIndex(ctrl)).toBe(0);
    });

    it("homePage state 被删除后, getHomePageIndex === -1 (失效)", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { HomePageCapability } = require("../../assets/script/controller/capabilities/HomePageCapability");
        const { ctrl } = setupCtrl();
        const target = ctrl._states[1];
        HomePageCapability.setHomePage(ctrl, target.stateId);

        // 删除 _states[1]
        ctrl.states = [ctrl._states[0]];
        expect(HomePageCapability.getHomePageIndex(ctrl)).toBe(-1);
    });

    it("runtime onLoad: dispatch onRuntimeInit 后, ctrl.selectedIndex 跳到 homePage", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { HomePageCapability } = require("../../assets/script/controller/capabilities/HomePageCapability");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");

        const { ctrl } = setupCtrl();
        // 模拟编辑器: 设 homePage = 第二个 state (index 1)
        const target = ctrl._states[1];
        HomePageCapability.setHomePage(ctrl, target.stateId);
        // 模拟反序列化: 当前 selectedIndex 仍是 0
        ctrl._selectedIndex = 0;

        // runtime: dispatch onRuntimeInit
        CapabilityRegistry.dispatch("onRuntimeInit", { ctrl });
        expect(ctrl.selectedIndex).toBe(1);
    });

    it("runtime onLoad: 未设 homePage 时, selectedIndex 不动", () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CapabilityRegistry } = require("../../assets/script/controller/CapabilityRegistry");
        const { ctrl } = setupCtrl();
        ctrl._selectedIndex = 0;
        CapabilityRegistry.dispatch("onRuntimeInit", { ctrl });
        expect(ctrl.selectedIndex).toBe(0);
    });

    it("StateController 反序列化字段: _homePageStateId 默认 -1", () => {
        const { ctrl } = setupCtrl();
        expect((ctrl as any)._homePageStateId).toBe(-1);
    });
});
