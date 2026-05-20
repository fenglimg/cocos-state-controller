/**
 * PropHandler.isEqual 契约红测试 (Wave 2 T01)
 *
 * 录制 prefab diff 路径依赖 IPropHandler.isEqual(a, b) 判断 snapshot vs current 是否变化:
 *   - 基础类型 (number/string/boolean): ===
 *   - 复合类型 (Vec3/Vec2/Color/Size): 按值比 (含 alpha)
 *   - 资源类型 (SpriteFrame/Font): 引用比 (=== 即可)
 *   - 边界: null/undefined 都视为 "无值", isEqual(undefined, undefined) === true
 *
 * 当前 IPropHandler 接口尚无 isEqual 方法, 本测试预期 ALL FAILURES。
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
const PropMod = require("../../assets/script/controller/StatePropHandler");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EnumMod = require("../../assets/script/controller/StateEnum");

const { PropHandlerManager } = PropMod;
const { EnumPropName } = EnumMod;

describe("PropHandler isEqual contract (Wave 2 T01)", () => {
    it("manager 暴露 isEqual 静态方法", () => {
        expect(typeof PropHandlerManager.isEqual).toBe("function");
    });

    it("Active (boolean): isEqual(true, true) = true; isEqual(true, false) = false", () => {
        expect(PropHandlerManager.isEqual(EnumPropName.Active, true, true)).toBe(true);
        expect(PropHandlerManager.isEqual(EnumPropName.Active, true, false)).toBe(false);
    });

    it("Opacity (number): isEqual(128, 128) = true; isEqual(128, 200) = false", () => {
        expect(PropHandlerManager.isEqual(EnumPropName.Opacity, 128, 128)).toBe(true);
        expect(PropHandlerManager.isEqual(EnumPropName.Opacity, 128, 200)).toBe(false);
    });

    it("LabelString (string): isEqual('hi','hi') = true; isEqual('hi','bye') = false", () => {
        expect(PropHandlerManager.isEqual(EnumPropName.LabelString, "hi", "hi")).toBe(true);
        expect(PropHandlerManager.isEqual(EnumPropName.LabelString, "hi", "bye")).toBe(false);
    });

    it("Position (Vec3): 按值比, 不是引用比", () => {
        const ccLocal = (globalThis as any).cc;
        const a = ccLocal.v3(10, 20, 30);
        const b = ccLocal.v3(10, 20, 30);
        const c = ccLocal.v3(10, 20, 31);
        expect(PropHandlerManager.isEqual(EnumPropName.Position, a, b)).toBe(true);
        expect(PropHandlerManager.isEqual(EnumPropName.Position, a, c)).toBe(false);
    });

    it("Euler (Vec3): 按值比", () => {
        const ccLocal = (globalThis as any).cc;
        expect(PropHandlerManager.isEqual(EnumPropName.Euler, ccLocal.v3(0, 0, 90), ccLocal.v3(0, 0, 90))).toBe(true);
        expect(PropHandlerManager.isEqual(EnumPropName.Euler, ccLocal.v3(0, 0, 90), ccLocal.v3(0, 0, 91))).toBe(false);
    });

    it("Anchor (Vec2): 按值比", () => {
        const ccLocal = (globalThis as any).cc;
        expect(PropHandlerManager.isEqual(EnumPropName.Anchor, ccLocal.v2(0.5, 0.5), ccLocal.v2(0.5, 0.5))).toBe(true);
        expect(PropHandlerManager.isEqual(EnumPropName.Anchor, ccLocal.v2(0.5, 0.5), ccLocal.v2(0, 0.5))).toBe(false);
    });

    it("Color: 按值比 (含 alpha)", () => {
        const ccLocal = (globalThis as any).cc;
        const red = ccLocal.color(255, 0, 0, 255);
        const redCopy = ccLocal.color(255, 0, 0, 255);
        const redHalf = ccLocal.color(255, 0, 0, 128); // 不同 alpha
        expect(PropHandlerManager.isEqual(EnumPropName.Color, red, redCopy)).toBe(true);
        expect(PropHandlerManager.isEqual(EnumPropName.Color, red, redHalf)).toBe(false);
    });

    it("Size: 按值比", () => {
        const ccLocal = (globalThis as any).cc;
        expect(PropHandlerManager.isEqual(EnumPropName.Size, ccLocal.size(100, 50), ccLocal.size(100, 50))).toBe(true);
        expect(PropHandlerManager.isEqual(EnumPropName.Size, ccLocal.size(100, 50), ccLocal.size(100, 51))).toBe(false);
    });

    it("SpriteFrame (资源): 引用比, 不深比", () => {
        const fakeFrameA = { uuid: "aaa" };
        const fakeFrameB = { uuid: "aaa" }; // 同 uuid 不同对象
        expect(PropHandlerManager.isEqual(EnumPropName.SpriteFrame, fakeFrameA, fakeFrameA)).toBe(true);
        // 同 uuid 但不同对象引用 → 视为变化 (引用比)
        expect(PropHandlerManager.isEqual(EnumPropName.SpriteFrame, fakeFrameA, fakeFrameB)).toBe(false);
    });

    it("undefined / null: isEqual(undefined, undefined) = true, isEqual(undefined, 0) = false", () => {
        expect(PropHandlerManager.isEqual(EnumPropName.Opacity, undefined, undefined)).toBe(true);
        expect(PropHandlerManager.isEqual(EnumPropName.Opacity, undefined, 0)).toBe(false);
        expect(PropHandlerManager.isEqual(EnumPropName.Active, null, null)).toBe(true);
        expect(PropHandlerManager.isEqual(EnumPropName.Active, null, false)).toBe(false);
    });

    it("LabelOutlineColor: 按值比 (含 alpha)", () => {
        const ccLocal = (globalThis as any).cc;
        const a = ccLocal.color(10, 20, 30, 200);
        const b = ccLocal.color(10, 20, 30, 200);
        const c = ccLocal.color(10, 20, 30, 201);
        expect(PropHandlerManager.isEqual(EnumPropName.LabelOutlineColor, a, b)).toBe(true);
        expect(PropHandlerManager.isEqual(EnumPropName.LabelOutlineColor, a, c)).toBe(false);
    });

    it("未注册 propType: isEqual 返回 false (保守: 视为有变化)", () => {
        expect(PropHandlerManager.isEqual(99999, "x", "x")).toBe(false);
    });
});
