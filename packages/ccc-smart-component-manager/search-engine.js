/**
 * 智能组件搜索引擎
 * 提供精确、高效的组件搜索和排序功能，支持收藏和高频组件权重加成
 */

// 引入数据管理器
const dataManager = require('./data-manager');
// 引入日志管理器
const logger = require('./logger');

class SearchEngine {
    /**
     * 计算匹配分数（简化版）
     * @param {string} input 用户输入
     * @param {string} target 目标字符串
     * @returns {object} 匹配结果
     */
    calculateMatchScore(input, target) {
        const inputLower = input.toLowerCase();
        const targetLower = target.toLowerCase();

        // 完全匹配 - 最高优先级
        if (inputLower === targetLower) {
            return {
                score: 1000,
                type: 'exact',
                index: 0,
                matchLength: input.length
            };
        }

        // 前缀匹配 - 高优先级
        if (targetLower.startsWith(inputLower)) {
            // 越短的目标字符串分数越高（更精确）
            const lengthBonus = Math.max(0, 50 - target.length);
            return {
                score: 800 + lengthBonus,
                type: 'prefix',
                index: 0,
                matchLength: input.length
            };
        }

        // 包含匹配 - 中等优先级
        const containsIndex = targetLower.indexOf(inputLower);
        if (containsIndex !== -1) {
            // 位置越靠前分数越高，目标字符串越短分数越高
            const positionBonus = Math.max(0, 50 - containsIndex * 3);
            const lengthBonus = Math.max(0, 30 - target.length);
            return {
                score: 500 + positionBonus + lengthBonus,
                type: 'contains',
                index: containsIndex,
                matchLength: input.length
            };
        }

        // 简单的模糊匹配 - 低优先级
        const fuzzyResult = this.simpleFuzzyMatch(inputLower, targetLower);
        if (fuzzyResult.score > 0) {
            return {
                score: fuzzyResult.score,
                type: 'fuzzy',
                index: fuzzyResult.index,
                matchLength: fuzzyResult.matchLength
            };
        }

        return null;
    }

    /**
     * 简化的模糊匹配算法
     */
    simpleFuzzyMatch(input, target) {
        let score = 0;
        let inputIndex = 0;
        let matchStart = -1;
        let matchedChars = 0;

        // 查找连续匹配的字符
        for (let targetIndex = 0; targetIndex < target.length && inputIndex < input.length; targetIndex++) {
            if (input[inputIndex] === target[targetIndex]) {
                if (matchStart === -1) {
                    matchStart = targetIndex;
                }
                matchedChars++;
                inputIndex++;
                score += 10;
            }
        }

        // 如果匹配的字符数量太少，认为不匹配
        if (matchedChars < Math.min(2, input.length * 0.7)) {
            return { score: 0, index: -1, matchLength: 0 };
        }

        // 根据匹配率和位置调整分数
        const matchRatio = matchedChars / input.length;
        const positionBonus = matchStart === 0 ? 50 : Math.max(0, 25 - matchStart);
        score = Math.floor(score * matchRatio + positionBonus);

        return {
            score: Math.min(score, 300), // 限制最高分数
            index: matchStart,
            matchLength: matchedChars
        };
    }

    /**
     * 搜索组件（简化版）
     * @param {string} input 用户输入
     * @param {object} componentRegistry 组件注册表
     * @returns {array} 排序后的匹配结果
     */
    searchComponents(input, componentRegistry) {
        if (!input || input.length === 0) {
            return [];
        }

        // 安全检查：限制查询长度和特殊字符
        if (input.length > 100) {
            logger.error(`搜索查询过长 (${input.length} 字符)，截断到100字符`);
            input = input.substring(0, 100);
        }

        // 转义特殊字符，防止正则表达式注入
        const safeInput = this.escapeRegExp(input);

        const results = [];

        for (let key in componentRegistry) {
            try {
                if (cc.js.isChildClassOf(componentRegistry[key], cc.Component)) {
                    const displayName = dataManager.getDisplayName(key);
                    const matchResult = this.calculateMatchScore(safeInput, displayName);

                    if (matchResult) {
                        // 加入用户偏好权重加成（仅收藏组件）
                        const weightBonus = dataManager.getWeightBonus(key);
                        const finalScore = matchResult.score + weightBonus;

                        const isFavorite = dataManager.isFavorite(key);
                        const usageCount = dataManager.getUsageCount(key);

                        // 调试信息
                        if ((isFavorite || usageCount > 0)) {
                            logger.debug(`搜索引擎: ${key} (${displayName}) - isFavorite=${isFavorite}, usageCount=${usageCount}`);
                        }

                        results.push({
                            input: input,
                            origin: key, // 保持原始名称用于添加组件
                            displayName: displayName, // 添加显示名称
                            index: matchResult.index,
                            matchLength: matchResult.matchLength,
                            score: finalScore,
                            baseScore: matchResult.score,
                            weightBonus: weightBonus,
                            type: matchResult.type,
                            isFavorite: isFavorite,
                            isFrequent: false, // 移除高频组件逻辑
                            usageCount: usageCount
                        });
                    }
                }
            } catch (error) {
                logger.error(`搜索组件时发生错误 [${key}]: ${error.message}`);
            }
        }

        // 按分数排序，分数高的在前
        results.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            // 分数相同时，按长度排序（短的在前，更精确）
            if (a.origin.length !== b.origin.length) {
                return a.origin.length - b.origin.length;
            }
            // 最后按字母顺序排序
            return a.origin.localeCompare(b.origin);
        });

        // 限制返回结果数量
        return results.slice(0, 20);
    }

    /**
     * 转义正则表达式特殊字符
     * @param {string} string 要转义的字符串
     * @returns {string} 转义后的字符串
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 高亮匹配的文本（简化版）
     * @param {string} text 原始文本
     * @param {number} index 匹配开始位置
     * @param {number} length 匹配长度
     * @param {string} type 匹配类型
     * @returns {string} 带高亮标记的HTML
     */
    highlightMatch(text, index, length, type = 'default') {
        if (index === -1 || length === 0) {
            return text;
        }

        const before = text.substring(0, index);
        const match = text.substring(index, index + length);
        const after = text.substring(index + length);

        // 根据匹配类型使用不同的样式类
        let className = 'ctex';
        if (type === 'exact') className += ' exact-match';
        else if (type === 'prefix') className += ' prefix-match';

        return `${before}<span class="${className}">${match}</span>${after}`;
    }

    /**
     * 获取收藏组件列表（用于空输入时显示）
     * @param {object} componentRegistry 组件注册表
     * @returns {array} 收藏组件列表
     */
    getFavoriteComponents(componentRegistry) {
        return dataManager.getFavoriteComponentsInfo(componentRegistry);
    }
}

// 导出搜索引擎实例
module.exports = new SearchEngine();
