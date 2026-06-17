/**
 * 属性值类型定义
 *
 * T2/X方案 收敛单轨后, 原表驱动的 PropHandlerManager (41→3 静态方法 + ~30 项 register 表)
 * 已整体删除 —— 属性读写/比较/clone 全部走 propRef 单轨:
 *   - 读: readPropFromNodeByPropRef + cloneValueByType (NestedCtrlData)
 *   - 写: writeNodeValueByPropRef
 *   - 比: eqValueByType (NestedCtrlData)
 *   - 老数字 key 数据: 加载时 migrateLegacyCtrlData 一次性转 propRef
 *
 * 本文件仅保留跨模块共享的 TPropValue 类型 (Capability / StateSelectV2 等仍引用)。
 */

/** 属性值统一类型 */
export type TPropValue
    = | number
    | boolean
    | string
    | cc.Vec3
    | cc.Vec2
    | cc.Color
    | cc.Size
    | cc.Quat
    | cc.SpriteFrame
    | cc.Font
    | undefined;
