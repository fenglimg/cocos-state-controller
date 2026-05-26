/**
 * W6 数据模型 (新): 嵌套 ctrlData 结构 + 按 cocos type 分发的 clone/eq helper
 *
 * 与 W5 之前的 EnumPropName 表驱动模型并行存在 — W6-1 仅引入, W6-2 才切换。
 *
 * 设计要点:
 *   - TNestedProp: 内层 propRef (e.g. "cc.Sprite.spriteFrame") -> value
 *   - TNestedCtrl: 外层 ctrlId -> { $$default$$?, [state]: TNestedProp }
 *   - cloneValueByType / eqValueByType: 按 cocos type 分发, 与 StatePropHandler 的 eqVec3/eqColor 等等价
 */

/** 单个 prop 的值集合 (propRef 字符串 -> any) */
export type TNestedProp = { [propRef: string]: any };

/**
 * 单个控制器在一个挂载节点上的嵌套数据.
 *   $$default$$ — 节点首次接入控制器时拍下的"基准值"
 *   [stateIndex] — 各 state 下的 override
 */
export type TNestedCtrlEntry = {
    $$default$$?: TNestedProp;
    [state: number]: TNestedProp;
};

/** 多控制器嵌套结构: ctrlId -> Entry */
export type TNestedCtrl = { [ctrlId: number]: TNestedCtrlEntry };

// ============================== 内省辅助 ==============================

/**
 * 探测 cocos type, 返回标准化字符串. 用于 clone/eq 分发.
 *
 * cocos 2.x 在 getClassAttrs 里的 type 取值:
 *   - 函数构造器 (cc.Color/cc.Vec3/cc.Vec2/cc.Size/cc.Quat 等)
 *   - 字符串 "Number" / "String" / "Boolean" / "Object" / "Enum"
 *   - undefined (没标 type, 走值本身的运行时类型判定)
 */
function isVecLike(t: any): t is "Vec2" | "Vec3" | "Color" | "Size" | "Quat" {
    if (typeof t !== "function") return false;
    const ccL = (globalThis as any).cc;
    if (!ccL) return false;
    return t === ccL.Vec3 || t === ccL.Vec2 || t === ccL.Color || t === ccL.Size || t === ccL.Quat;
}

// ============================== clone ==============================

/**
 * 按 cocos type 分发深拷:
 *   - cc.Color/Vec3/Vec2/Size/Quat 走构造器深拷
 *   - 基础类型 (Number/String/Boolean) 直传
 *   - asset (cc.SpriteFrame/cc.Font 等) 引用直传
 *   - undefined/null 直传
 */
export function cloneValueByType(value: any, cocosType: any): any {
    if (value === undefined || value === null) return value;
    const ccL = (globalThis as any).cc;
    if (ccL && typeof cocosType === "function") {
        if (cocosType === ccL.Color) {
            const c = value as cc.Color;
            return ccL.color(c.r, c.g, c.b, c.a);
        }
        if (cocosType === ccL.Vec3) {
            const v = value as cc.Vec3;
            return ccL.v3(v.x, v.y, v.z);
        }
        if (cocosType === ccL.Vec2) {
            const v = value as cc.Vec2;
            return ccL.v2(v.x, v.y);
        }
        if (cocosType === ccL.Size) {
            const s = value as cc.Size;
            return ccL.size(s.width, s.height);
        }
        if (ccL.Quat && cocosType === ccL.Quat) {
            const q = value as cc.Quat;
            return new ccL.Quat(q.x, q.y, q.z, q.w);
        }
        // 其余 function-typed (Asset 等) 引用直传
        return value;
    }
    // W6-axis-decomp: cocosType 未知 (cc.Node 内置 native 字段在 listTrackableProps 返回 cocosType=undefined),
    // 但值可能是 Color/Vec3/Vec2/Size/Quat 实例 — 此时也要深拷, 否则 baseline snapshot 和节点共享引用,
    // 节点 mutate 时 baseline 跟着改 → diff 永远命中"等" → dirty 检测漏报 (反向 bug).
    if (ccL && value && typeof value === "object") {
        if (ccL.Color && value instanceof ccL.Color) {
            const c = value as cc.Color;
            return ccL.color(c.r, c.g, c.b, c.a);
        }
        if (ccL.Vec3 && value instanceof ccL.Vec3) {
            const v = value as cc.Vec3;
            return ccL.v3(v.x, v.y, v.z);
        }
        if (ccL.Vec2 && value instanceof ccL.Vec2) {
            const v = value as cc.Vec2;
            return ccL.v2(v.x, v.y);
        }
        if (ccL.Size && value instanceof ccL.Size) {
            const s = value as cc.Size;
            return ccL.size(s.width, s.height);
        }
        if (ccL.Quat && value instanceof ccL.Quat) {
            const q = value as cc.Quat;
            return new ccL.Quat(q.x, q.y, q.z, q.w);
        }
    }
    // 基础类型 / 未知 type — 引用 (基础类型按值传) 直传
    return value;
}

// ============================== eq ==============================

/**
 * 按 cocos type 分发等值判定. 与 cloneValueByType 的 type 集合对齐.
 *
 * 规则:
 *   - 双侧均为 nil (undefined/null) 视为相等
 *   - 一侧 nil 视为不等
 *   - Color/Vec3/Vec2/Size/Quat 字段比
 *   - 其余走 strict ===
 */
export function eqValueByType(a: any, b: any, cocosType: any): boolean {
    const aNil = a === undefined || a === null;
    const bNil = b === undefined || b === null;
    if (aNil && bNil) return true;
    if (aNil !== bNil) return false;

    const ccL = (globalThis as any).cc;
    if (ccL && typeof cocosType === "function") {
        if (cocosType === ccL.Color) {
            const ac = a as cc.Color;
            const bc = b as cc.Color;
            return ac.r === bc.r && ac.g === bc.g && ac.b === bc.b && ac.a === bc.a;
        }
        if (cocosType === ccL.Vec3) {
            const av = a as cc.Vec3;
            const bv = b as cc.Vec3;
            return av.x === bv.x && av.y === bv.y && av.z === bv.z;
        }
        if (cocosType === ccL.Vec2) {
            const av = a as cc.Vec2;
            const bv = b as cc.Vec2;
            return av.x === bv.x && av.y === bv.y;
        }
        if (cocosType === ccL.Size) {
            const as_ = a as cc.Size;
            const bs = b as cc.Size;
            return as_.width === bs.width && as_.height === bs.height;
        }
        if (ccL.Quat && cocosType === ccL.Quat) {
            const aq = a as cc.Quat;
            const bq = b as cc.Quat;
            return aq.x === bq.x && aq.y === bq.y && aq.z === bq.z && aq.w === bq.w;
        }
    }
    // W6-axis-decomp: cocosType 未知 (e.g. cc.Node 内置 native 字段在 listTrackableProps 里 cocosType=undefined),
    // 但若两侧都是 cc 复合对象 (Color/Vec3/Vec2/Size/Quat 等 instanceof 命中), 也走结构比 — 否则
    // 不同 frame/getter 的同值对象会 strict !== 引起 false-positive dirty (cc.Node.quat/color/rotation 等).
    if (ccL && a && b && typeof a === "object" && typeof b === "object") {
        if (ccL.Color && (a instanceof ccL.Color) && (b instanceof ccL.Color)) {
            return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
        }
        if (ccL.Quat && (a instanceof ccL.Quat) && (b instanceof ccL.Quat)) {
            return a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w;
        }
        if (ccL.Vec3 && (a instanceof ccL.Vec3) && (b instanceof ccL.Vec3)) {
            return a.x === b.x && a.y === b.y && a.z === b.z;
        }
        if (ccL.Vec2 && (a instanceof ccL.Vec2) && (b instanceof ccL.Vec2)) {
            return a.x === b.x && a.y === b.y;
        }
        if (ccL.Size && (a instanceof ccL.Size) && (b instanceof ccL.Size)) {
            return a.width === b.width && a.height === b.height;
        }
    }
    // 基础类型 / asset 引用 / 未知 — strict ===
    return a === b;
}

// 抑制 isVecLike 未使用警告 (保留供 W6-2/W6-3 复用)
void isVecLike;
