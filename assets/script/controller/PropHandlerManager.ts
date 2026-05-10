import { EnumPropName } from "./StateEnum";
import { IPropHandler, TPropValue } from "./types";

/**
 * 🔧 属性处理器管理类 - 统一管理所有属性处理器的注册和访问
 *
 * 核心优势：
 * 1. 集中管理：所有属性处理器统一注册和管理
 * 2. 类型安全：基于枚举的类型检查
 * 3. 易于扩展：新增属性只需实现接口并注册
 * 4. 性能优化：使用Map提供O(1)的查找效率
 */
export class PropHandlerManager {
    // 🔧 使用Map存储处理器，提供高效的O(1)查找性能
    private static handlers = new Map<EnumPropName, IPropHandler>();

    /**
     * 🔧 注册属性处理器 - 将属性处理器与对应的属性类型关联
     * @param propType 属性类型枚举
     * @param handler 属性处理器实例
     */
    public static register(propType: EnumPropName, handler: IPropHandler) {
        this.handlers.set(propType, handler);
    }

    /**
     * 🔧 获取属性处理器 - 根据属性类型获取对应的处理器
     * @param propType 属性类型枚举
     * @returns 对应的属性处理器，如果没有则返回undefined
     */
    public static getHandler(propType: EnumPropName): IPropHandler | undefined {
        return this.handlers.get(propType);
    }

    /** 获取属性值 */
    public static getValue(propType: EnumPropName, node: cc.Node): TPropValue | undefined {
        if (!node) return undefined;
        const handler = this.getHandler(propType);
        return handler ? handler.getValue(node) : undefined;
    }

    /** 设置属性值 */
    public static setValue(propType: EnumPropName, node: cc.Node, value: TPropValue): void {
        if (!node) return;
        const handler = this.getHandler(propType);
        if (handler) {
            handler.setValue(node, value);
        }
    }

    /** 获取默认值 */
    public static getDefaultValue(propType: EnumPropName, node: cc.Node): TPropValue | undefined {
        if (!node) return undefined;
        const handler = this.getHandler(propType);
        return handler ? handler.getDefaultValue(node) : undefined;
    }
}
