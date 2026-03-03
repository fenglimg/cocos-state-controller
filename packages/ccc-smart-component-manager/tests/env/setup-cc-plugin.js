/**
 * 插件测试环境补充设置
 * 引擎由 cocos2d-js-for-preview.js 提供，这里只补充插件运行所需的全局对象
 */

// logger.js 依赖 Editor 全局对象
if (typeof Editor === 'undefined') {
    global.Editor = {
        log() {},
        warn() {},
        error() {},
    };
}
