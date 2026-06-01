/**
 * W6 数据模型基线 (基础设施): prefab 内省, 用于枚举一个节点上"可追踪"的 prop 集合.
 *
 * 走 cocos 2.4.x 引擎自己用的元数据:
 *   - (ctor as any).__props__: ctor 的 @property / native 字段名数组
 *   - cc.Class.Attr.getClassAttrs(ctor): 每个 prop 的 visible / serializable / type / hasGetter / hasSetter 等
 *
 * 输出 listTrackableProps(node) 返回 [{compName, propKey, propRef, cocosType, visible, serializable, readonly}].
 *
 * 过滤规则:
 *   - 跳过 _ 开头的内部存储字段 (cocos 2.x 用 `_xxx` + getter/setter 模式, 上层 `xxx` 才是 user-facing)
 *   - 跳过 attrs[propKey + "$_$visible"] === false 的字段 (cocos 明确标记不显示)
 *   - 跳过 SYSTEM_EXCLUDE 黑名单 (cc.Widget.target / _alignFlags / cc.Animation.defaultClip 等)
 *   - readonly = hasGetter === true 且 hasSetter !== true (只读 getter 不可写)
 *
 * 共存阶段: W6-1 仅引入, W6-2 切换到取代 PropHandlerManager.listRegisteredPropTypes 的扫描路径.
 */

/** 单条可追踪 prop 描述 */
export interface TrackableProp {
    /** 组件类名 (cc.Node / cc.Sprite / W6TestComp 等) */
    compName: string;
    /** 字段名 (active / spriteFrame / heatLevel 等) */
    propKey: string;
    /** propRef = compName + "." + propKey, 是 NestedCtrlData 的 key */
    propRef: string;
    /** cocos getClassAttrs 返回的 type — 函数构造器 or "Number"/"String"/"Boolean"/"Object"/"Enum"/undefined */
    cocosType: any;
    /** inspector 可见性 (false=不可见) */
    visible: boolean;
    /** prefab 序列化标记 */
    serializable: boolean;
    /** 只读 (getter only, 无 setter) */
    readonly: boolean;
}

/**
 * 系统黑名单 — 这些 prop 即使可见也不参与 state 切换 (引擎内部状态 / 资源关联).
 *
 * 选取理由:
 *   - cc.Widget.target: 节点引用, prefab 实例化时不稳定
 *   - cc.Widget._alignFlags: 内部对齐 bitmask
 *   - cc.Animation.defaultClip / currentClip: 资源引用, 应通过 play() 切换
 *   - cc.ParticleSystem.file: 粒子配置资源
 *   - cc.AudioSource.clip: 音频资源
 *   - cc.Node.rotation / rotationX / rotationY: cocos 2.1.0 起废弃, 读写会触发 cc.warn (使用 angle / eulerAngles 替代)
 */
export const SYSTEM_EXCLUDE: string[] = [
    "cc.Widget.target",
    "cc.Widget.alignFlags",
    "cc.Animation.defaultClip",
    "cc.Animation.currentClip",
    "cc.ParticleSystem.file",
    "cc.AudioSource.clip",
    "cc.Node.rotation",
    "cc.Node.rotationX",
    "cc.Node.rotationY",
];

const EXCLUDE_SET = new Set(SYSTEM_EXCLUDE);

/**
 * 取构造器类名:
 *   - 内置 cc 类 (cc.Sprite/cc.Widget 等): cc.js.getClassName(ctor) 返回 "cc.Sprite"
 *   - 自定义 @ccclass 类: 返回 @ccclass("Name") 注册名
 *   - fallback: ctor.name
 */
function getCompName(ctor: any): string {
    const ccL = (globalThis as any).cc;
    if (ccL && ccL.js && typeof ccL.js.getClassName === "function") {
        const cn = ccL.js.getClassName(ctor);
        if (typeof cn === "string" && cn.length > 0) return cn;
    }
    // cocos 2.x 也把 @ccclass 注册名写到 ctor.__classname__ (某些版本)
    const cnAlt = (ctor as any).__classname__;
    if (typeof cnAlt === "string" && cnAlt.length > 0) return cnAlt;
    if (ctor && ctor.name) return ctor.name;
    return "UnknownClass";
}

/**
 * 枚举一个 ctor 上的可追踪 prop. 不递归父类 (cocos __props__ 已合并继承链).
 */
function enumPropsForCtor(ctor: any, compName: string): TrackableProp[] {
    const out: TrackableProp[] = [];
    const props = (ctor as any).__props__ as string[] | undefined;
    if (!Array.isArray(props)) return out;
    const ccL = (globalThis as any).cc;
    const attrs = ccL && ccL.Class && ccL.Class.Attr && ccL.Class.Attr.getClassAttrs
        ? ccL.Class.Attr.getClassAttrs(ctor)
        : {};
    for (const propKey of props) {
        // 跳过下划线内部字段
        if (propKey.startsWith("_")) continue;
        const propRef = `${compName}.${propKey}`;
        // 跳过系统黑名单
        if (EXCLUDE_SET.has(propRef)) continue;
        const visAttr = attrs[`${propKey}$_$visible`];
        // 跳过显式 visible:false
        if (visAttr === false) continue;
        const serAttr = attrs[`${propKey}$_$serializable`];
        const typeAttr = attrs[`${propKey}$_$type`];
        const hasGetter = attrs[`${propKey}$_$hasGetter`];
        const hasSetter = attrs[`${propKey}$_$hasSetter`];
        const readonly = hasGetter === true && hasSetter !== true;
        out.push({
            compName,
            propKey,
            propRef,
            cocosType: typeAttr,
            // visible 默认 true (undefined 视为可见), 已在上面排除了 false
            visible: visAttr !== false,
            // serializable 默认 true, 显式 false 才标 false
            serializable: serAttr !== false,
            readonly,
        });
    }
    return out;
}

/**
 * 列出节点上所有可追踪的 prop:
 *   - cc.Node 类的 user-facing 字段 (active/x/y/scale/color/opacity/anchorX 等)
 *   - 节点 _components 上每个 cc.Component 子类的 @property 字段
 *
 * 顺序: 先 cc.Node, 再按 _components 顺序.
 */
export function listTrackableProps(node: cc.Node): TrackableProp[] {
    if (!node) return [];
    const ccL = (globalThis as any).cc;
    const out: TrackableProp[] = [];

    // 1) cc.Node 自身
    out.push(...enumPropsForCtor(ccL.Node, "cc.Node"));

    // 2) 节点上每个组件
    const comps = (node as any)._components as cc.Component[] | undefined;
    if (Array.isArray(comps)) {
        for (const comp of comps) {
            if (!comp) continue;
            const ctor = (comp as any).constructor;
            const compName = getCompName(ctor);
            out.push(...enumPropsForCtor(ctor, compName));
        }
    }

    return out;
}
