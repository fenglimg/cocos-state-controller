/**
 * 智能组件管理器 - 日志管理器
 * 提供分级日志功能，支持两个等级：
 * 1. ALL - 打印所有日志和错误信息
 * 2. ERROR_ONLY - 只打印错误信息
 */

class Logger {
    constructor() {
        // 日志等级枚举
        this.LOG_LEVELS = {
            ALL: 'ALL',           // 打印所有日志
            ERROR_ONLY: 'ERROR_ONLY'  // 只打印错误
        };

        // 默认日志等级为ALL
        this.currentLevel = this.LOG_LEVELS.ERROR_ONLY;
    }

    /**
     * 安全的日志输出函数
     * @param {string} message 日志消息
     * @param {string} level 日志等级
     */
    _safeLog(message, level = 'INFO') {
        try {
            const timestamp = new Date().toLocaleTimeString();
            const formattedMessage = `[${timestamp}] [${level}] ${message}`;

            if (typeof Editor !== 'undefined' && Editor.log) {
                Editor.log(formattedMessage);
            }
        } catch (e) {
            // 静默处理日志错误
            Editor.error(e);
        }
    }

    /**
     * 普通信息日志
     * @param {string} message 日志消息
     */
    info(message) {
        if (this.currentLevel === this.LOG_LEVELS.ALL) {
            this._safeLog(message, 'INFO');
        }
    }

    /**
     * 警告日志
     * @param {string} message 日志消息
     */
    warn(message) {
        if (this.currentLevel === this.LOG_LEVELS.ALL) {
            this._safeLog(message, 'WARN');
        }
    }

    /**
     * 错误日志（总是显示）
     * @param {string} message 日志消息
     */
    error(message) {
        this._safeLog(message, 'ERROR');
    }

    /**
     * 调试日志（只在ALL模式下显示）
     * @param {string} message 日志消息
     */
    debug(message) {
        if (this.currentLevel === this.LOG_LEVELS.ALL) {
            this._safeLog(message, 'DEBUG');
        }
    }

    /**
     * 成功日志
     * @param {string} message 日志消息
     */
    success(message) {
        if (this.currentLevel === this.LOG_LEVELS.ALL) {
            this._safeLog(message, 'SUCCESS');
        }
    }

    /**
     * IPC错误处理（特殊处理超时错误）
     * @param {string} operation 操作名称
     * @param {Error} error 错误对象
     */
    ipcError(operation, error) {
        if (error && error.code === 'ETIMEOUT') {
            // 超时错误只在ALL模式下显示为调试信息
            this.debug(`IPC超时: ${operation} - ${error.message}`);
        } else {
            // 其他IPC错误总是显示
            this.warn(`IPC错误: ${operation} - ${error ? error.message : '未知错误'}`);
        }
    }

    setLogLevel(level) {
        this.currentLevel = level;
    }
}

// 导出单例实例
module.exports = new Logger();
