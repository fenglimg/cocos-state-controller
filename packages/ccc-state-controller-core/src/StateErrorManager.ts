/** 🔧 错误级别枚举 */
export enum ErrorLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4,
    SILENT = 5, // 特殊级别：完全静音
}

/** 🔧 错误处理上下文接口 */
export interface IErrorContext {
    component?: string
    method?: string
    params?: unknown
    node?: cc.Node
}

/**
 * 🔧 统一错误处理类 - 为整个状态控制器系统提供统一的错误处理机制
 *
 * 核心功能：
 * 1. 统一的日志格式和输出
 * 2. 按级别分类的错误处理
 * 3. 编辑器和运行时环境的适配
 * 4. 优雅的降级处理机制
 * 5. 常见错误场景的验证工具
 * 6. 可配置的日志级别控制
 */
export class StateErrorManager {
    private static readonly COMPONENT_NAME = "StateController";

    /** 🔧 当前日志输出级别，只有高于或等于此级别的日志才会输出 */
    private static _logLevel: ErrorLevel = ErrorLevel.WARN;

    /** 🔧 设置日志输出级别 */
    public static setLogLevel(level: ErrorLevel) {
        this._logLevel = level;
        this.info(`日志级别已设置为: ${ErrorLevel[level]}`);
    }

    /** 🔧 获取当前日志级别 */
    public static getLogLevel(): ErrorLevel {
        return this._logLevel;
    }

    /** 🔧 检查是否应该输出指定级别的日志 */
    private static shouldLog(level: ErrorLevel): boolean {
        return level >= this._logLevel;
    }

    /**
     * 🔧 统一日志输出方法 - 根据不同错误级别和环境选择合适的输出方式
     *
     * @param level 错误级别
     * @param message 错误消息
     * @param context 错误上下文，包含组件、方法、参数等详细信息
     */
    private static log(level: ErrorLevel, message: string, context?: IErrorContext) {
        // 🔧 级别检查：如果当前级别低于设定级别，则不输出
        if (!this.shouldLog(level)) {
            return;
        }

        const levelName = ErrorLevel[level];
        const prefix = `[${this.COMPONENT_NAME}][${levelName}]`;
        const fullMessage = context
            ? `${prefix} ${message} | Context: ${JSON.stringify(context)}`
            : `${prefix} ${message}`;

        // 🔧 根据错误级别选择不同的输出方式
        switch (level) {
            case ErrorLevel.DEBUG:
                // 🔧 调试信息：仅在开发模式下输出，使用较低的优先级
                if (CC_EDITOR) {
                    cc.log(`🔍 ${fullMessage}`);
                }
                else {
                    // console.debug ? console.debug(fullMessage) : console.log(fullMessage);
                }
                break;
            case ErrorLevel.INFO:
                if (CC_EDITOR) {
                    cc.log(fullMessage);
                }
                else {
                    // console.log(fullMessage);
                }
                break;
            case ErrorLevel.WARN:
                // 🔧 编辑器环境使用cc.warn，运行时使用console.warn
                if (CC_EDITOR) {
                    cc.warn(fullMessage);
                }
                else {
                    // console.warn(fullMessage);
                }
                break;
            case ErrorLevel.ERROR:
                // 🔧 编辑器环境使用cc.error，运行时使用console.error
                if (CC_EDITOR) {
                    cc.error(fullMessage);
                }
                else {
                    // console.error(fullMessage);
                }
                break;
            case ErrorLevel.FATAL:
                // 🔧 致命错误：使用特殊标识符，便于快速定位严重问题
                if (CC_EDITOR) {
                    cc.error(`💥 FATAL: ${fullMessage}`);
                }
                else {
                    // console.error(`💥 FATAL: ${fullMessage}`);
                }
                break;
        }
    }

    /** 友好的用户提示 */
    public static userFriendlyError(userMessage: string, technicalDetails?: string, context?: IErrorContext) {
        this.log(ErrorLevel.ERROR, userMessage, context);
        if (technicalDetails) {
            this.log(ErrorLevel.INFO, `技术细节: ${technicalDetails}`, context);
        }
    }

    /**
     * 🔧 核心方法：优雅降级处理 - 在操作失败时提供安全的备选方案
     *
     * 这是系统稳定性的关键机制：
     * 1. 捕获所有异常，避免系统崩溃
     * 2. 提供合理的降级值，保证功能连续性
     * 3. 记录错误信息，便于问题追踪
     * 4. 对用户透明，不影响正常使用流程
     *
     * @param operation 要执行的操作函数
     * @param fallbackValue 操作失败时的降级返回值
     * @param errorMessage 自定义错误消息
     * @returns 操作成功时返回原值，失败时返回降级值
     */
    public static gracefulFallback<T>(operation: () => T, fallbackValue: T, errorMessage?: string): T {
        try {
            return operation();
        }
        catch (error) {
            // 🔧 记录错误并返回安全的降级值，确保系统继续运行
            this.log(ErrorLevel.WARN, errorMessage || "操作失败，使用降级处理", { params: { error: error.message } });
            return fallbackValue;
        }
    }

    /**
     * 🔧 节点有效性验证 - 防止对无效节点的操作导致系统错误
     *
     * 常见的节点无效场景：
     * 1. 节点被删除但引用仍然存在
     * 2. 节点在场景切换时被销毁
     * 3. 节点引用为null或undefined
     * 4. 节点的isValid属性为false
     *
     * @param node 要验证的节点
     * @param context 验证上下文信息
     * @returns 节点有效返回true，无效返回false
     */
    public static validateNode(node: cc.Node, context?: IErrorContext): boolean {
        if (!node || !node.isValid) {
            this.userFriendlyError(
                "节点无效或已被销毁",
                "请检查节点是否存在且未被删除",
                context,
            );
            return false;
        }
        return true;
    }

    /** 验证属性类型 */
    public static validatePropType(propType: unknown, context?: IErrorContext): boolean {
        if (propType === undefined || propType === null) {
            this.userFriendlyError(
                "属性类型不能为空",
                "请选择有效的属性类型",
                context,
            );
            return false;
        }
        return true;
    }

    // 🔧 便捷方法：直接调用不同级别的日志

    /** 调试日志 */
    public static debug(message: string, context?: IErrorContext) {
        this.log(ErrorLevel.DEBUG, message, context);
    }

    /** 信息日志 */
    public static info(message: string, context?: IErrorContext) {
        this.log(ErrorLevel.INFO, message, context);
    }

    /** 警告日志 */
    public static warn(message: string, context?: IErrorContext) {
        this.log(ErrorLevel.WARN, message, context);
    }

    /** 错误日志 */
    public static error(message: string, context?: IErrorContext) {
        this.log(ErrorLevel.ERROR, message, context);
    }

    /** 致命错误日志 */
    public static fatal(message: string, context?: IErrorContext) {
        this.log(ErrorLevel.FATAL, message, context);
    }
}
