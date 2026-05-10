/**
 * 🔧 状态控制器运行时核心类型定义
 *
 * 此模块集中所有跨文件共享的类型/接口，便于:
 * 1. 解耦 PropHandlerManager 与 41 个内置 PropHandler 实现
 * 2. 避免 StateSelect / BuiltinPropHandlers 之间的循环类型引用
 * 3. 为未来扩展(自定义 PropHandler, schema 演进)提供集中扩展点
 */

/** 属性值统一类型 - 所有 PropHandler 支持的值类型联合 */
export type TPropValue =
    | number
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

/**
 * 🔧 属性处理器接口 - 定义所有属性处理器必须实现的标准接口
 *
 * 三个方法保持精简：
 * 1. getValue   - 读取节点当前属性值
 * 2. setValue   - 写入节点属性值
 * 3. getDefaultValue - 读取节点默认值（一般等同 getValue）
 */
export interface IPropHandler {
    /** 获取属性值 */
    getValue(node: cc.Node): TPropValue | undefined;
    /** 设置属性值 */
    setValue(node: cc.Node, value: TPropValue): void;
    /** 获取默认值 */
    getDefaultValue(node: cc.Node): TPropValue | undefined;
}
