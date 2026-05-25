/**
 * W6-1 红测试: NestedCtrlData.cloneValueByType + eqValueByType 契约
 *
 * 复合类型 (Color/Vec3/Vec2/Size/Quat) 走深拷 + 字段比;
 * 基础类型 (number/string/boolean) 直传 + ===;
 * 资源 (SpriteFrame/Font) 引用直传 + ===;
 * undefined/null 走 strict ===.
 */

declare global {
    const CC_EDITOR: boolean;
    const cc: any;
}

beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Mod = require("../../assets/script/controller/NestedCtrlData");

const { cloneValueByType, eqValueByType } = Mod;
const ccL = (globalThis as any).cc;

describe("NestedCtrlData.cloneValueByType", () => {
    it("cc.Color 深拷 (返回新对象, 字段相等)", () => {
        const c = ccL.color(100, 50, 200, 128);
        const clone = cloneValueByType(c, ccL.Color);
        expect(clone).not.toBe(c);
        expect(clone.r).toBe(100);
        expect(clone.g).toBe(50);
        expect(clone.b).toBe(200);
        expect(clone.a).toBe(128);
        // 改 clone 不影响原
        clone.r = 0;
        expect(c.r).toBe(100);
    });

    it("cc.Vec3 深拷", () => {
        const v = ccL.v3(1, 2, 3);
        const clone = cloneValueByType(v, ccL.Vec3);
        expect(clone).not.toBe(v);
        expect(clone.x).toBe(1);
        expect(clone.y).toBe(2);
        expect(clone.z).toBe(3);
        clone.x = 999;
        expect(v.x).toBe(1);
    });

    it("cc.Vec2 深拷", () => {
        const v = ccL.v2(5, 6);
        const clone = cloneValueByType(v, ccL.Vec2);
        expect(clone).not.toBe(v);
        expect(clone.x).toBe(5);
        expect(clone.y).toBe(6);
    });

    it("cc.Size 深拷", () => {
        const s = ccL.size(100, 200);
        const clone = cloneValueByType(s, ccL.Size);
        expect(clone).not.toBe(s);
        expect(clone.width).toBe(100);
        expect(clone.height).toBe(200);
        clone.width = 0;
        expect(s.width).toBe(100);
    });

    it("number / string / boolean 直传 (基础类型不需要拷)", () => {
        expect(cloneValueByType(42, "Number")).toBe(42);
        expect(cloneValueByType("hello", "String")).toBe("hello");
        expect(cloneValueByType(true, "Boolean")).toBe(true);
    });

    it("undefined / null 直传", () => {
        expect(cloneValueByType(undefined, ccL.Color)).toBeUndefined();
        expect(cloneValueByType(null, ccL.Vec3)).toBeNull();
    });

    it("asset 类型 (cc.SpriteFrame 类) 引用直传 — 不深拷 asset", () => {
        const fakeAsset = { uuid: "test-uuid", name: "fake.png" };
        const clone = cloneValueByType(fakeAsset, ccL.SpriteFrame);
        // 引用相同, 不应该深拷 asset
        expect(clone).toBe(fakeAsset);
    });
});

describe("NestedCtrlData.eqValueByType", () => {
    it("cc.Color 按 r/g/b/a 比较", () => {
        const a = ccL.color(1, 2, 3, 4);
        const b = ccL.color(1, 2, 3, 4);
        const c = ccL.color(1, 2, 3, 5);
        expect(eqValueByType(a, b, ccL.Color)).toBe(true);
        expect(eqValueByType(a, c, ccL.Color)).toBe(false);
    });

    it("cc.Vec3 按 x/y/z 比较", () => {
        const a = ccL.v3(1, 2, 3);
        const b = ccL.v3(1, 2, 3);
        const c = ccL.v3(1, 2, 4);
        expect(eqValueByType(a, b, ccL.Vec3)).toBe(true);
        expect(eqValueByType(a, c, ccL.Vec3)).toBe(false);
    });

    it("cc.Vec2 按 x/y 比较", () => {
        const a = ccL.v2(1, 2);
        const b = ccL.v2(1, 2);
        const c = ccL.v2(1, 3);
        expect(eqValueByType(a, b, ccL.Vec2)).toBe(true);
        expect(eqValueByType(a, c, ccL.Vec2)).toBe(false);
    });

    it("cc.Size 按 width/height 比较", () => {
        const a = ccL.size(10, 20);
        const b = ccL.size(10, 20);
        const c = ccL.size(10, 21);
        expect(eqValueByType(a, b, ccL.Size)).toBe(true);
        expect(eqValueByType(a, c, ccL.Size)).toBe(false);
    });

    it("基础类型走 strict ===", () => {
        expect(eqValueByType(1, 1, "Number")).toBe(true);
        expect(eqValueByType(1, 2, "Number")).toBe(false);
        expect(eqValueByType("a", "a", "String")).toBe(true);
        expect(eqValueByType("a", "b", "String")).toBe(false);
        expect(eqValueByType(true, true, "Boolean")).toBe(true);
        expect(eqValueByType(true, false, "Boolean")).toBe(false);
    });

    it("undefined / null 双侧均为 nil 视为相等", () => {
        expect(eqValueByType(undefined, undefined, ccL.Color)).toBe(true);
        expect(eqValueByType(null, null, ccL.Vec3)).toBe(true);
        expect(eqValueByType(null, undefined, ccL.Vec3)).toBe(true);
    });

    it("一侧 nil 一侧有值 视为不等", () => {
        expect(eqValueByType(undefined, ccL.color(0, 0, 0, 0), ccL.Color)).toBe(false);
        expect(eqValueByType(ccL.v3(0, 0, 0), null, ccL.Vec3)).toBe(false);
    });

    it("asset 类型引用比较 (===)", () => {
        const asset1 = { uuid: "a" };
        const asset2 = { uuid: "a" }; // 不同对象, 不同 ref
        expect(eqValueByType(asset1, asset1, ccL.SpriteFrame)).toBe(true);
        expect(eqValueByType(asset1, asset2, ccL.SpriteFrame)).toBe(false);
    });
});
