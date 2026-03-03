/**
 * 本地数据管理器
 * 管理收藏组件和高频组件的数据存储
 */

const fs = require('fs');
const logger = require('./logger');
const path = require('path');

class DataManager {
    constructor() {
        this.dataPath = path.join(__dirname, 'user-data.json');
        this.data = {
            favorites: [], // 收藏的组件列表
            usage: {}, // 组件使用频率统计 { componentName: count }
            settings: {
                logLevel: 'ERROR_ONLY', // 日志等级：ALL(所有日志) 或 ERROR_ONLY(仅错误)
                autoPropertyMount: {
                    enabled: true,              // 是否启用自动属性挂载
                    ignoreCase: true,           // 忽略大小写差异
                    flexibleMatching: true,     // 字母顺序匹配（允许中间有符号分隔）
                    showMountLog: true          // 是否显示挂载日志
                },
                shortcuts: {
                    focusSearchInput: 'CmdOrCtrl+F'  // 聚焦搜索框的快捷键
                },
                confirmations: {
                    deleteComponentConfirm: true,    // 已有组件右键删除时是否显示确认对话框
                    favoriteToggleConfirm: true      // 搜索组件右键收藏时是否显示提醒
                }
            }
        };

        // 延迟加载数据，避免循环依赖
        setTimeout(() => {
            this.loadData();
        }, 500);
    }

    /**
     * 获取组件的显示名称（去掉cc.前缀）
     * @param {string} componentName 完整组件名称
     * @returns {string} 显示名称
     */
    getDisplayName(componentName) {
        if (componentName.startsWith('cc.')) {
            return componentName.substring(3);
        }
        return componentName;
    }

    /**
     * 获取组件的存储键名（用于数据存储，保持原始名称）
     * @param {string} componentName 组件名称
     * @returns {string} 存储键名
     */
    getStorageKey(componentName) {
        return componentName; // 保持原始名称用于存储
    }

    /**
     * 加载本地数据
     */
    loadData() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const content = fs.readFileSync(this.dataPath, 'utf-8');
                const savedData = JSON.parse(content);
                // 确保数据结构完整
                this.saveData(savedData);
                this.forceSaveToFile();
                logger.info('数据管理器: 本地数据加载成功');
            } else {
                logger.info('数据管理器: 首次运行，创建新的数据文件');
                this.saveData({});
                this.forceSaveToFile();
            }
        } catch (error) {
            logger.error('数据管理器: 加载数据失败', error);
            this.saveData({});
            this.forceSaveToFile();
        }
    }

    saveData(data) {
        this.data = {
            favorites: data?.favorites || [],
            usage: data?.usage || {},
            settings: data?.settings || {
                logLevel: data?.settings?.logLevel || 'ERROR_ONLY',
                autoPropertyMount: {
                    enabled: data?.settings?.autoPropertyMount?.enabled || true,
                    ignoreCase: data?.settings?.autoPropertyMount?.ignoreCase || true,
                    flexibleMatching: data?.settings?.autoPropertyMount?.flexibleMatching || true,
                    showMountLog: data?.settings?.autoPropertyMount?.showMountLog || true
                },
                shortcuts: {
                    focusSearchInput: data?.settings?.shortcuts?.focusSearchInput || 'CmdOrCtrl+F'
                },
                confirmations: {
                    deleteComponentConfirm: data?.settings?.confirmations?.deleteComponentConfirm ?? true,
                    favoriteToggleConfirm: data?.settings?.confirmations?.favoriteToggleConfirm ?? true
                },
                theme: data?.settings?.theme || 'vibrant-dark'
            }
        }
        logger.setLogLevel(this.data.settings.logLevel);
    }

    /**
     * 强制同步保存数据（用于重要操作） 先修改data，再调用forceSave
     */
    forceSaveToFile() {
        try {
            // 确保目录存在
            const dir = path.dirname(this.dataPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // 同步写入文件
            fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8');

            // 验证数据一致性
            this.validateDataConsistency();

            logger.info('数据管理器: 强制保存成功，数据已同步到内存');
        } catch (error) {
            logger.error(`数据管理器: 强制保存失败: ${error.message}`);
        }
    }

    /**
     * 验证内存数据与文件数据的一致性
     */
    validateDataConsistency() {
        try {
            if (!fs.existsSync(this.dataPath)) {
                logger.warn('数据管理器: 数据文件不存在，无法验证一致性');
                return false;
            }

            const fileContent = fs.readFileSync(this.dataPath, 'utf-8');
            const fileData = JSON.parse(fileContent);

            // 比较关键数据
            const memoryFavorites = JSON.stringify(this.data.favorites || []);
            const fileFavorites = JSON.stringify(fileData.favorites || []);

            const memoryUsage = JSON.stringify(this.data.usage || {});
            const fileUsage = JSON.stringify(fileData.usage || {});

            const memorySettings = JSON.stringify(this.data.settings || {});
            const fileSettings = JSON.stringify(fileData.settings || {});

            if (memoryFavorites !== fileFavorites ||
                memoryUsage !== fileUsage ||
                memorySettings !== fileSettings) {
                logger.warn('数据管理器: 检测到内存与文件数据不一致，正在同步...');
                this.data = fileData;
                return false;
            }

            logger.debug('数据管理器: 数据一致性验证通过');
            return true;
        } catch (error) {
            logger.error(`数据管理器: 数据一致性验证失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 设置日志等级
     * @param {string} level 日志等级
     */
    setLogLevel(level) {
        if (!this.data.settings) {
            this.data.settings = {};
        }
        this.data.settings.logLevel = level;
        logger.setLogLevel(level);
        this.forceSaveToFile();
        logger.info(`数据管理器: 日志等级已设置为 ${level}`);
    }

    /**
     * 获取日志等级
     * @returns {string} 日志等级
     */
    getLogLevel() {
        return this.data.settings?.logLevel || 'ERROR_ONLY';
    }

    /**
     * 获取自动挂载设置
     * @returns {object} 自动挂载设置
     */
    getAutoMountSettings() {
        return this.data.settings?.autoPropertyMount || {
            enabled: true,
            ignoreCase: true,
            flexibleMatching: true,
            showMountLog: true
        };
    }

    /**
     * 设置自动挂载配置
     * @param {object} settings 自动挂载设置
     */
    setAutoMountSettings(settings) {
        if (!this.data.settings) {
            this.data.settings = {};
        }
        this.data.settings.autoPropertyMount = settings;
        this.forceSaveToFile();
        logger.info('数据管理器: 自动挂载设置已保存');
    }

    /**
     * 获取统计信息
     * @returns {object} 统计信息
     */
    getStats() {
        const favorites = this.data.favorites || [];
        const usage = this.data.usage || {};

        let totalUsage = 0;
        for (let component in usage) {
            totalUsage += usage[component];
        }

        return {
            favoritesCount: favorites.length,
            totalUsage: totalUsage,
            mostUsedComponent: this.getMostUsedComponent()
        };
    }

    /**
     * 获取最常用的组件
     * @returns {string} 最常用的组件名
     */
    getMostUsedComponent() {
        const usage = this.data.usage || {};
        let maxUsage = 0;
        let mostUsed = '';

        for (let component in usage) {
            if (usage[component] > maxUsage) {
                maxUsage = usage[component];
                mostUsed = component;
            }
        }

        return mostUsed || '无';
    }

    /**
     * 添加组件到收藏夹
     * @param {string} componentName 组件名称
     */
    addToFavorites(componentName) {
        if (!this.data.favorites.includes(componentName)) {
            this.data.favorites.push(componentName);
            this.forceSaveToFile();
            return true;
        }
        return false;
    }

    /**
     * 从收藏夹移除组件
     * @param {string} componentName 组件名称
     */
    removeFromFavorites(componentName) {
        const index = this.data.favorites.indexOf(componentName);
        if (index !== -1) {
            this.data.favorites.splice(index, 1);
            this.forceSaveToFile();
            // 通知主面板更新
            this.notifyDataUpdated('favorites-cleared');
            return true;
        }
        return false;
    }

    /**
     * 检查组件是否在收藏夹中
     * @param {string} componentName 组件名称
     * @returns {boolean}
     */
    isFavorite(componentName) {
        const result = this.data.favorites.includes(componentName);
        // logger.info(`数据管理器: ${componentName} 在收藏夹中`);
        return result;
    }

    /**
     * 获取收藏夹列表
     * @returns {array}
     */
    getFavorites() {
        return [...this.data.favorites];
    }

    /**
     * 获取收藏组件的详细信息，用于显示
     * @param {object} componentRegistry 组件注册表
     * @returns {array} 收藏组件的详细信息列表
     */
    getFavoriteComponentsInfo(componentRegistry) {
        const favoriteInfos = [];

        for (const componentName of this.data.favorites) {
            // 检查组件是否仍然存在于注册表中
            if (componentRegistry[componentName] &&
                cc.js.isChildClassOf(componentRegistry[componentName], cc.Component)) {

                const displayName = this.getDisplayName(componentName);
                const usageCount = this.getUsageCount(componentName);

                favoriteInfos.push({
                    origin: componentName,
                    displayName: displayName,
                    isFavorite: true,
                    isFrequent: false, // 移除高频逻辑
                    usageCount: usageCount,
                    score: 1000, // 收藏组件给予高分
                    type: 'favorite'
                });
            }
        }

        // 按使用次数排序，使用次数高的在前
        favoriteInfos.sort((a, b) => {
            if (b.usageCount !== a.usageCount) {
                return b.usageCount - a.usageCount;
            }
            // 使用次数相同时按字母顺序排序
            return a.displayName.localeCompare(b.displayName);
        });

        return favoriteInfos;
    }

    /**
     * 记录组件使用
     * @param {string} componentName 组件名称
     */
    recordUsage(componentName) {
        if (!this.data.usage[componentName]) {
            this.data.usage[componentName] = 0;
        }
        this.data.usage[componentName]++;
        this.forceSaveToFile();
    }

    /**
     * 获取组件使用次数
     * @param {string} componentName 组件名称
     * @returns {number}
     */
    getUsageCount(componentName) {
        return this.data.usage[componentName] || 0;
    }


    /**
     * 获取组件的权重加成
     * @param {string} componentName 组件名称
     * @returns {number} 权重加成分数
     */
    getWeightBonus(componentName) {
        let bonus = 0;

        // 收藏组件加成
        if (this.isFavorite(componentName)) {
            bonus += 200;
        }

        return bonus;
    }

    /**
     * 清空使用统计
     */
    clearUsageStats() {
        this.data.usage = {};
        // 强制同步保存，确保数据被写入
        this.forceSaveToFile();
        logger.info('数据管理器: 使用统计已清空并保存');
    }

    /**
     * 清空收藏夹
     */
    clearFavorites() {
        this.data.favorites = [];
        // 强制同步保存，确保内存数据与文件同步
        this.forceSaveToFile();

        // 通知所有面板数据已更新
        this.notifyDataUpdated('favorites-cleared');

        logger.info('数据管理器: 收藏夹已清空并保存');
    }

    /**
     * 通知数据更新
     * @param {string} type 更新类型
     */
    notifyDataUpdated(type) {
        try {
            // 延迟通知，确保所有面板都已加载
            setTimeout(() => {
                try {
                    // 通知主面板
                    if (typeof Editor !== 'undefined' && Editor.Ipc && Editor.Ipc.sendToPanel) {
                        Editor.Ipc.sendToPanel('ccc-smart-component-manager', 'ccc-smart-component-manager:data-updated', { type: type });
                        logger.debug(`数据管理器: 已通知主面板数据更新 (${type})`);
                    }
                } catch (error) {
                    logger.error(`数据管理器: 通知面板更新失败: ${error.message}`);
                }
            }, 100);
        } catch (error) {
            logger.error(`数据管理器: 设置通知失败: ${error.message}`);
        }
    }

    /**
     * 获取统计信息
     * @returns {object}
     */
    getStats() {
        return {
            favoritesCount: this.data.favorites.length,
            totalUsage: Object.values(this.data.usage).reduce((sum, count) => sum + count, 0),
            uniqueComponents: Object.keys(this.data.usage).length
        };
    }

    // ========== 自动属性挂载相关方法 ==========

    /**
     * 获取自动挂载是否启用
     * @returns {boolean}
     */
    getAutoMountEnabled() {
        return this.data?.settings?.autoPropertyMount?.enabled ?? true;
    }

    /**
     * 设置自动挂载启用状态
     * @param {boolean} enabled 是否启用
     */
    setAutoMountEnabled(enabled) {
        if (!this.data.settings.autoPropertyMount) {
            this.data.settings.autoPropertyMount = {};
        }
        this.data.settings.autoPropertyMount.enabled = enabled;
        this.forceSaveToFile();
    }

    /**
     * 获取自动挂载配置
     * @returns {object} 挂载配置
     */
    getAutoMountConfig() {
        const defaultConfig = {
            enabled: true,
            ignoreCase: true,
            flexibleMatching: true,
            showMountLog: true
        };

        return {
            ...defaultConfig,
            ...this.data.settings.autoPropertyMount
        };
    }

    /**
     * 更新自动挂载配置
     * @param {object} config 新的配置
     */
    updateAutoMountConfig(config) {
        if (!this.data.settings.autoPropertyMount) {
            this.data.settings.autoPropertyMount = {};
        }

        Object.assign(this.data.settings.autoPropertyMount, config);
        this.forceSaveToFile();
        logger.info('数据管理器: 自动挂载配置已更新');
    }

    // ========== 快捷键设置相关方法 ==========

    /**
     * 获取快捷键设置
     * @returns {object} 快捷键配置
     */
    getShortcutSettings() {
        const defaultSettings = {
            focusSearchInput: 'CmdOrCtrl+F'
        };

        return {
            ...defaultSettings,
            ...this.data.settings.shortcuts
        };
    }

    /**
     * 设置聚焦搜索框的快捷键
     * @param {string} shortcut 快捷键字符串
     */
    setFocusSearchInputShortcut(shortcut) {
        if (!this.data.settings.shortcuts) {
            this.data.settings.shortcuts = {};
        }
        this.data.settings.shortcuts.focusSearchInput = shortcut;
        this.forceSaveToFile();
        logger.info(`数据管理器: 聚焦搜索框快捷键已设置为 ${shortcut}`);
    }

    /**
     * 获取聚焦搜索框的快捷键
     * @returns {string} 快捷键字符串
     */
    getFocusSearchInputShortcut() {
        return this.data.settings.shortcuts?.focusSearchInput || 'CmdOrCtrl+F';
    }

    // ========== 主题设置相关方法 ==========

    /**
     * 获取当前主题
     * @returns {string} 主题名称
     */
    getTheme() {
        return this.data.settings.theme || 'vibrant-dark';
    }

    /**
     * 设置主题
     * @param {string} theme 主题名称
     */
    setTheme(theme) {
        const validThemes = ['vibrant-dark', 'warm-dark', 'cyberpunk', 'forest', 'sunset', 'ocean'];
        if (validThemes.includes(theme)) {
            this.data.settings.theme = theme;
            this.forceSaveToFile();
            logger.info(`主题已切换: ${theme}`);
        }
    }

    // ========== 确认对话框设置相关方法 ==========

    /**
     * 获取确认对话框设置
     * @returns {object} 确认对话框配置
     */
    getConfirmationSettings() {
        const defaultSettings = {
            deleteComponentConfirm: true,
            favoriteToggleConfirm: true
        };

        return {
            ...defaultSettings,
            ...this.data.settings.confirmations
        };
    }

    /**
     * 设置删除组件确认对话框
     * @param {boolean} enabled 是否启用确认对话框
     */
    setDeleteComponentConfirm(enabled) {
        if (!this.data.settings.confirmations) {
            this.data.settings.confirmations = {};
        }
        this.data.settings.confirmations.deleteComponentConfirm = enabled;
        this.forceSaveToFile();
        logger.info(`数据管理器: 删除组件确认对话框已${enabled ? '启用' : '禁用'}`);
    }

    /**
     * 获取删除组件确认对话框设置
     * @returns {boolean} 是否启用确认对话框
     */
    getDeleteComponentConfirm() {
        return this.data.settings.confirmations?.deleteComponentConfirm ?? true;
    }

    /**
     * 设置收藏切换提醒
     * @param {boolean} enabled 是否启用提醒
     */
    setFavoriteToggleConfirm(enabled) {
        if (!this.data.settings.confirmations) {
            this.data.settings.confirmations = {};
        }
        this.data.settings.confirmations.favoriteToggleConfirm = enabled;
        this.forceSaveToFile();
        logger.info(`数据管理器: 收藏切换提醒已${enabled ? '启用' : '禁用'}`);
    }

    /**
     * 获取收藏切换提醒设置
     * @returns {boolean} 是否启用提醒
     */
    getFavoriteToggleConfirm() {
        return this.data.settings.confirmations?.favoriteToggleConfirm ?? true;
    }
}

// 导出单例实例
module.exports = new DataManager();
