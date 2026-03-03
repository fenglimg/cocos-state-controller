/**
 * 国际化辅助工具
 * 提供多语言支持功能
 */

const path = require('path');

class I18nHelper {
    constructor() {
        this.currentLanguage = 'zh'; // 默认中文
        this.translations = {};
        this.loadTranslations();
    }

    /**
     * 加载翻译文件
     */
    loadTranslations() {
        try {
            // 检测系统语言
            this.detectSystemLanguage();

            // 加载中文翻译
            const zhPath = path.join(__dirname, 'i18n', 'zh.js');
            delete require.cache[require.resolve(zhPath)];
            this.translations.zh = require(zhPath);

            // 尝试加载英文翻译，如果不存在则使用中文作为后备
            try {
                const enPath = path.join(__dirname, 'i18n', 'en.js');
                delete require.cache[require.resolve(enPath)];
                this.translations.en = require(enPath);
            } catch (enError) {
                this.translations.en = this.translations.zh; // 使用中文作为后备
            }

        } catch (error) {
            this.currentLanguage = 'zh';
            this.translations = { zh: {}, en: {} };
        }
    }

    /**
     * 检测系统语言
     */
    detectSystemLanguage() {
        try {
            // 尝试从 Editor 获取语言设置
            if (typeof Editor !== 'undefined' && Editor.lang) {
                this.currentLanguage = Editor.lang.startsWith('zh') ? 'zh' : 'en';
                return;
            }

            // 从环境变量检测
            const locale = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || process.env.LC_MESSAGES || '';
            this.currentLanguage = locale.toLowerCase().includes('zh') ? 'zh' : 'en';
        } catch (error) {
            this.currentLanguage = 'zh';
        }
    }

    /**
     * 设置当前语言
     * @param {string} language 语言代码 ('zh' 或 'en')
     */
    setLanguage(language) {
        if (language === 'zh' || language === 'en') {
            this.currentLanguage = language;
        }
    }

    /**
     * 获取翻译文本
     * @param {string} key 翻译键，支持点号分隔的嵌套键
     * @param {object} params 参数对象，用于替换模板变量
     * @returns {string} 翻译后的文本
     */
    t(key, params = {}) {
        try {
            const translation = this.translations[this.currentLanguage] || this.translations.zh;
            let result = this.getNestedValue(translation, key);

            // 如果当前语言没有找到，尝试使用中文作为后备
            if (!result && this.currentLanguage !== 'zh') {
                result = this.getNestedValue(this.translations.zh, key);
            }

            // 如果还是没有找到，返回键名
            if (!result) {
                return key;
            }

            // 替换参数
            return this.replaceParams(result, params);
        } catch (error) {
            return key;
        }
    }

    /**
     * 获取嵌套对象的值
     * @param {object} obj 对象
     * @param {string} path 路径，用点号分隔
     * @returns {any} 值
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : null;
        }, obj);
    }

    /**
     * 替换模板参数
     * @param {string} template 模板字符串
     * @param {object} params 参数对象
     * @returns {string} 替换后的字符串
     */
    replaceParams(template, params) {
        if (typeof template !== 'string') {
            return template;
        }

        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
    }

    /**
     * 获取当前语言
     * @returns {string} 当前语言代码
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * 获取支持的语言列表
     * @returns {array} 支持的语言列表
     */
    getSupportedLanguages() {
        return [
            { code: 'zh', name: '中文' },
            { code: 'en', name: 'English' }
        ];
    }

    /**
     * 重新加载翻译文件
     */
    reload() {
        this.loadTranslations();
    }
}

// 创建全局实例
const i18nHelper = new I18nHelper();

// 导出实例和便捷方法
module.exports = {
    i18n: i18nHelper,
    t: (key, params) => i18nHelper.t(key, params),
    setLanguage: (language) => i18nHelper.setLanguage(language),
    getCurrentLanguage: () => i18nHelper.getCurrentLanguage(),
    getSupportedLanguages: () => i18nHelper.getSupportedLanguages(),
    reload: () => i18nHelper.reload()
};
