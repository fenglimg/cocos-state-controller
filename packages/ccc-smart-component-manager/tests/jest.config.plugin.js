/**
 * Jest 配置 - 插件测试（JS）
 * 复用现有引擎环境（cocos2d-js-for-preview），面向当前插件的 JS 测试
 */
module.exports = {
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/__tests__'],
    testMatch: ['**/*.test.js'],
    setupFiles: [
        'jest-canvas-mock',
        '<rootDir>/env/cocos2d-js-for-preview.js',
        '<rootDir>/env/setup-cc-plugin.js',
    ],
};
