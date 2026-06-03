/**
 * Round4 #U4 + #U7: eqValueByType 边界.
 * U4: eqValueByType(NaN, NaN, undefined) 应 true (否则 NaN 值持续 dirty 误判 + 重复写)。
 * U7: 一侧 cc.Color 实例、另一侧老 .fire 反序列化的普通 {r,g,b,a} → 应按字段判等 true (否则 false dirty)。
 */
declare global { const CC_EDITOR: boolean; const cc: any; const Editor: any; }
beforeAll(() => {
    (globalThis as any).CC_EDITOR = true;
    (globalThis as any).Editor = { log:()=>{},warn:()=>{},error:()=>{}, Utils:{refreshSelectedInspector:()=>{}} };
});
const { eqValueByType } = require("../../assets/script/controller/NestedCtrlData");
const ccL = (globalThis as any).cc;

describe("#U4 NaN 相等", () => {
    it("eqValueByType(NaN, NaN) → true", () => {
        expect(eqValueByType(NaN, NaN, undefined)).toBe(true);
    });
    it("eqValueByType(NaN, 5) → false (不同)", () => {
        expect(eqValueByType(NaN, 5, undefined)).toBe(false);
    });
});

describe("#U7 cc 实例 vs 普通对象 同值判等", () => {
    it("cc.Color 实例 vs 普通 {r,g,b,a} 同值 → true", () => {
        const inst = ccL.color(255, 0, 0, 255);
        const plain = { r: 255, g: 0, b: 0, a: 255 };
        expect(eqValueByType(plain, inst, undefined)).toBe(true);
        expect(eqValueByType(inst, plain, undefined)).toBe(true);
    });
    it("cc.Color 实例 vs 普通 {r,g,b,a} 不同值 → false", () => {
        const inst = ccL.color(255, 0, 0, 255);
        const plain = { r: 0, g: 0, b: 0, a: 255 };
        expect(eqValueByType(plain, inst, undefined)).toBe(false);
    });
    it("cc.Vec3 实例 vs 普通 {x,y,z} 同值 → true", () => {
        const inst = ccL.v3(1, 2, 3);
        const plain = { x: 1, y: 2, z: 3 };
        expect(eqValueByType(plain, inst, undefined)).toBe(true);
    });
});
export {};
