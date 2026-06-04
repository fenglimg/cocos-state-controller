/**
 * StateSelectV2 挂载自动 opt-in 契约 (TASK-003).
 *
 * 行为变更: StateSelectV2.__preload 时, 若 getCurrCtrl() 返回有效 ctrl, 遍历 applicable prop
 * 全量调 togglePropertyControl(propType, true). 用户不想要的 prop 在 inspector 手动取消即可.
 *
 * 同时:
 *   - isApplicableProp 公开方法 (wrap PropertyControlService.isPropertyAvailable, 让外部调用方
 *     不直接依赖 service 名字)
 *   - "⚡ 一键配置属性" inspector 按钮删除 (自动后不再需要)
 *
 * 红预期: 当前 __preload 不会自动接入 prop; isApplicableProp 不存在。
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnumV2");

const { StateControllerV2 } = ControllerMod;
const { StateSelectV2 } = SelectMod;
const { EnumPropName } = EnumMod;

function setupBare() {
    const ccLocal = (globalThis as any).cc;
    const root = new ccLocal.Node("Root");
    const ctrlNode = new ccLocal.Node("CtrlNode");
    root.addChild(ctrlNode);
    const selectNode = new ccLocal.Node("SelectNode");
    ctrlNode.addChild(selectNode);

    const ctrl = ctrlNode.addComponent(StateControllerV2);
    (ctrl as any).__preload();

    return { root, ctrl, ctrlNode, selectNode };
}

describe("StateSelectV2 挂载自动 opt-in (TASK-003)", () => {
    it("StateSelectV2 暴露 isApplicableProp 方法", () => {
        const { selectNode } = setupBare();
        const select = selectNode.addComponent(StateSelectV2);
        (select as any).__preload();
        expect(typeof (select as any).isApplicableProp).toBe("function");
    });

    it("isApplicableProp(Active) = true (节点基础属性)", () => {
        const { selectNode } = setupBare();
        const select = selectNode.addComponent(StateSelectV2);
        (select as any).__preload();
        expect((select as any).isApplicableProp(EnumPropName.Active)).toBe(true);
        expect((select as any).isApplicableProp(EnumPropName.Opacity)).toBe(true);
        expect((select as any).isApplicableProp(EnumPropName.Color)).toBe(true);
    });

    it("isApplicableProp(SpriteFrame) 当节点没 cc.Sprite 组件 = false", () => {
        const { selectNode } = setupBare();
        const select = selectNode.addComponent(StateSelectV2);
        (select as any).__preload();
        expect((select as any).isApplicableProp(EnumPropName.SpriteFrame)).toBe(false);
    });

    it("isApplicableProp(SpriteFrame) 当节点有 cc.Sprite 组件 = true", () => {
        const { selectNode } = setupBare();
        const ccLocal = (globalThis as any).cc;
        selectNode.addComponent(ccLocal.Sprite);
        const select = selectNode.addComponent(StateSelectV2);
        (select as any).__preload();
        expect((select as any).isApplicableProp(EnumPropName.SpriteFrame)).toBe(true);
    });

    it("__preload 后, 节点基础属性 (Active/Opacity/Color) 全部自动 controlled", () => {
        const { selectNode } = setupBare();
        const select = selectNode.addComponent(StateSelectV2);
        (select as any).__preload();

        expect(select.isPropertyControlled(EnumPropName.Active)).toBe(true);
        expect(select.isPropertyControlled(EnumPropName.Opacity)).toBe(true);
        expect(select.isPropertyControlled(EnumPropName.Color)).toBe(true);
    });

    it("__preload 后, 节点没 cc.Sprite 组件时 SpriteFrame 不被自动接入", () => {
        const { selectNode } = setupBare();
        const select = selectNode.addComponent(StateSelectV2);
        (select as any).__preload();
        expect(select.isPropertyControlled(EnumPropName.SpriteFrame)).toBe(false);
    });

    it("__preload 后, 节点有 cc.Sprite 组件时 SpriteFrame 自动接入", () => {
        const { selectNode } = setupBare();
        const ccLocal = (globalThis as any).cc;
        selectNode.addComponent(ccLocal.Sprite);
        const select = selectNode.addComponent(StateSelectV2);
        (select as any).__preload();
        expect(select.isPropertyControlled(EnumPropName.SpriteFrame)).toBe(true);
    });

    it("用户 togglePropertyControl(propType, false) 后该 prop 退出 controlled (opt-out 路径不变)", () => {
        const { selectNode } = setupBare();
        const select = selectNode.addComponent(StateSelectV2);
        (select as any).__preload();
        expect(select.isPropertyControlled(EnumPropName.Color)).toBe(true);
        select.togglePropertyControl(EnumPropName.Color, false);
        expect(select.isPropertyControlled(EnumPropName.Color)).toBe(false);
    });
});
