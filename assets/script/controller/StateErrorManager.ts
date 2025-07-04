/** 🔧 错误级别枚举 */
export enum ErrorLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    FATAL = 'fatal'
}

/** 🔧 错误处理上下文接口 */
export interface IErrorContext {
    component?: string;
    method?: string;
    params?: any;
    node?: cc.Node;
}

/** 🔧 统一错误处理类 */
export class StateErrorManager {
    private static readonly COMPONENT_NAME = 'StateController';

    /** 统一日志输出 */
    static log(level: ErrorLevel, message: string, context?: IErrorContext) {
        const prefix = `[${this.COMPONENT_NAME}]`;
        const fullMessage = context
            ? `${prefix} ${message} | Context: ${JSON.stringify(context)}`
            : `${prefix} ${message}`;

        switch (level) {
            case ErrorLevel.INFO:
                console.log(fullMessage);
                break;
            case ErrorLevel.WARN:
                if (CC_EDITOR) {
                    cc.warn(fullMessage);
                } else {
                    console.warn(fullMessage);
                }
                break;
            case ErrorLevel.ERROR:
                if (CC_EDITOR) {
                    cc.error(fullMessage);
                } else {
                    console.error(fullMessage);
                }
                break;
            case ErrorLevel.FATAL:
                if (CC_EDITOR) {
                    cc.error(`💥 FATAL: ${fullMessage}`);
                } else {
                    console.error(`💥 FATAL: ${fullMessage}`);
                }
                break;
        }
    }

    /** 友好的用户提示 */
    static userFriendlyError(userMessage: string, technicalDetails?: string, context?: IErrorContext) {
        this.log(ErrorLevel.ERROR, userMessage, context);
        if (technicalDetails) {
            this.log(ErrorLevel.INFO, `技术细节: ${technicalDetails}`, context);
        }
    }

    /** 降级处理 */
    static gracefulFallback<T>(operation: () => T, fallbackValue: T, errorMessage?: string): T {
        try {
            return operation();
        } catch (error) {
            this.log(ErrorLevel.WARN, errorMessage || '操作失败，使用降级处理', {
                params: { error: error.message }
            });
            return fallbackValue;
        }
    }

    /** 验证节点有效性 */
    static validateNode(node: cc.Node, context?: IErrorContext): boolean {
        if (!node || !node.isValid) {
            this.userFriendlyError(
                '节点无效或已被销毁',
                '请检查节点是否存在且未被删除',
                context
            );
            return false;
        }
        return true;
    }

    /** 验证属性类型 */
    static validatePropType(propType: any, context?: IErrorContext): boolean {
        if (propType === undefined || propType === null) {
            this.userFriendlyError(
                '属性类型不能为空',
                '请选择有效的属性类型',
                context
            );
            return false;
        }
        return true;
    }
}
