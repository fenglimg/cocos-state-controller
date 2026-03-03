/**
 * 智能属性自动挂载模块
 * 负责组件属性的自动挂载功能
 */

// 🔧 添加防护性检查，避免加载时错误
const logger = require('./logger');

class PropertyMounter {
    constructor() {
        this.mountResults = [];
    }

    /**
     * 递归遍历节点树（带安全检查）
     * @param {cc.Node} rootNode 根节点
     * @param {Function} callback 回调函数
     * @param {Set} visited 已访问节点集合（防止循环引用）
     * @param {number} depth 当前深度（防止过深递归）
     * @param {number} maxDepth 最大深度限制
     * @param {number} maxNodes 最大节点数限制
     */
    traverseNodeTree(rootNode, callback, visited = new Set(), depth = 0, maxDepth = 50, maxNodes = 5000) {
        if (!rootNode || depth > maxDepth || visited.size > maxNodes) {
            if (depth > maxDepth) {
                logger.warn(`节点树遍历深度超限 (${maxDepth})，停止遍历`);
            }
            if (visited.size > maxNodes) {
                logger.warn(`节点数量超限 (${maxNodes})，停止遍历`);
            }
            return;
        }

        // 防止循环引用
        const nodeId = rootNode.uuid || rootNode._id || rootNode.name + '_' + depth;
        if (visited.has(nodeId)) {
            logger.warn(`检测到循环引用节点: ${rootNode.name || 'unnamed'}`);
            return;
        }

        visited.add(nodeId);

        try {
            callback(rootNode);
        } catch (error) {
            logger.error(`遍历节点回调失败 [${rootNode.name || 'unnamed'}]: ${error.message}`);
        }

        if (rootNode.children && rootNode.children.length > 0) {
            rootNode.children.forEach(child => {
                this.traverseNodeTree(child, callback, visited, depth + 1, maxDepth, maxNodes);
            });
        }

    }

    /**
     * 调试组件结构
     * @param {cc.Component} component 组件实例
     */
    debugComponentStructure(component) {
        if (!component || !component.constructor) {
            logger.debug('组件或构造函数为空');
            return;
        }

        const constructor = component.constructor;
        const className = cc.js.getClassName(constructor);

        logger.debug(`=== 调试组件结构 [${className}] ===`);
        logger.debug(`构造函数名: ${constructor.name}`);
        logger.debug(`__props__: ${constructor.__props__ ? 'exists' : 'null'}`);
        logger.debug(`__attrs__: ${constructor.__attrs__ ? 'exists' : 'null'}`);

        // 🔧 输出关键属性的实际值
        const keyProps = ['label', 'labelOutdsa', 'dsdsadsa'];
        logger.debug(`关键属性实际值:`);
        keyProps.forEach(propName => {
            try {
                const value = component[propName];
                const valueDesc = value === null ? 'null' :
                    value === undefined ? 'undefined' :
                        `${typeof value}${value && value.constructor ? ` (${value.constructor.name})` : ''}`;
                logger.debug(`  - ${propName}: ${valueDesc}`);
            } catch (error) {
                logger.debug(`  - ${propName}: 访问失败 (${error.message})`);
            }
        });

        if (constructor.__props__) {
            logger.debug(`__props__ 内容: ${JSON.stringify(constructor.__props__, null, 2)}`);
        }

        if (constructor.__attrs__) {
            logger.debug(`__attrs__ 内容: ${JSON.stringify(constructor.__attrs__, null, 2)}`);
        }

        // 检查 cc.Class.Attr
        if (cc.Class && cc.Class.Attr && cc.Class.Attr.getClassAttrs) {
            try {
                const attrs = cc.Class.Attr.getClassAttrs(constructor);
                logger.debug(`cc.Class.Attr.getClassAttrs 结果: ${attrs ? 'exists' : 'null'}`);

                if (attrs) {
                    // 解析 Cocos Creator 属性格式
                    const propertyMap = {};
                    Object.keys(attrs).forEach(key => {
                        const parts = key.split('$_$');
                        if (parts.length === 2) {
                            const propName = parts[0];
                            const attrType = parts[1];

                            if (!propertyMap[propName]) {
                                propertyMap[propName] = {};
                            }

                            if (attrType === 'ctor') {
                                propertyMap[propName].type = cc.js.getClassName(attrs[key]);
                            } else if (attrType === 'type') {
                                propertyMap[propName].typeString = attrs[key];
                            } else if (attrType === 'default') {
                                propertyMap[propName].defaultValue = attrs[key];
                            }
                        }
                    });

                    logger.debug(`解析后的属性映射: ${JSON.stringify(propertyMap, null, 2)}`);
                }
            } catch (error) {
                logger.debug(`cc.Class.Attr.getClassAttrs 错误: ${error.message}`);
            }
        } else {
            logger.debug('cc.Class.Attr.getClassAttrs 不可用');
        }

        logger.debug('=== 调试结束 ===');
    }

    /**
     * 解析组件的属性定义
     * @param {cc.Component} component 组件实例
     * @returns {Array} 属性列表
     */
    parseComponentProperties(component) {
        const properties = [];

        if (!component || !component.constructor) {
            return properties;
        }

        const constructor = component.constructor;
        const className = cc.js.getClassName(constructor);

        try {
            // 遍历继承链获取所有属性信息
            const allProperties = {};
            let currentClass = constructor;
            const visitedClasses = new Set();
            let inheritanceDepth = 0;
            const maxInheritanceDepth = 20; // 防止过深的继承链

            // 向上遍历继承链直到 cc.Component
            while (currentClass && currentClass !== cc.Component && inheritanceDepth < maxInheritanceDepth) {
                // 防止循环继承
                const className = currentClass.name || 'Anonymous';
                if (visitedClasses.has(className)) {
                    logger.warn(`检测到循环继承: ${className}`);
                    break;
                }
                visitedClasses.add(className);
                inheritanceDepth++;
                if (cc.Class && cc.Class.Attr && cc.Class.Attr.getClassAttrs) {
                    const rawAttrs = cc.Class.Attr.getClassAttrs(currentClass);

                    if (rawAttrs) {
                        logger.debug(`解析类 [${cc.js.getClassName(currentClass)}] 的属性`);

                        // 解析 Cocos Creator 的属性命名约定
                        Object.keys(rawAttrs).forEach(key => {
                            const parts = key.split('$_$');
                            if (parts.length === 2) {
                                const propName = parts[0];
                                const attrType = parts[1];

                                // 只有当属性不存在时才添加（子类优先）
                                if (!allProperties[propName]) {
                                    allProperties[propName] = {};
                                }

                                if (attrType === 'ctor') {
                                    allProperties[propName].type = rawAttrs[key];
                                    allProperties[propName].fromClass = cc.js.getClassName(currentClass);
                                } else if (attrType === 'type') {
                                    allProperties[propName].typeString = rawAttrs[key];
                                } else if (attrType === 'default') {
                                    allProperties[propName].defaultValue = rawAttrs[key];
                                }
                            }
                        });
                    }
                }

                // 移动到父类
                currentClass = Object.getPrototypeOf(currentClass);
            }

            // 转换为我们需要的格式
            Object.keys(allProperties).forEach(propName => {
                const propInfo = allProperties[propName];

                // 处理有类型构造函数且为组件类型或节点类型的属性
                if (propInfo.type &&
                    typeof propInfo.type === 'function' &&
                    (cc.js.isChildClassOf(propInfo.type, cc.Component) ||
                        cc.js.isChildClassOf(propInfo.type, cc.Node) ||
                        propInfo.type === cc.Node)) {

                    const currentValue = component[propName];
                    const isEmpty = this.isPropertyEmpty(currentValue);

                    properties.push({
                        name: propName,
                        type: propInfo.type,
                        typeName: cc.js.getClassName(propInfo.type),
                        currentValue: currentValue,
                        isNull: isEmpty,
                        fromClass: propInfo.fromClass || className
                    });

                    logger.debug(`找到可挂载属性: ${propName} (${cc.js.getClassName(propInfo.type)}) 来自 ${propInfo.fromClass}`);
                    logger.debug(`  - 当前值: ${currentValue === null ? 'null' : (currentValue === undefined ? 'undefined' : typeof currentValue)}`);
                    logger.debug(`  - cc.isValid(): ${typeof cc !== 'undefined' && typeof cc.isValid === 'function' ? cc.isValid(currentValue) : 'N/A'}`);
                    logger.debug(`  - 是否为空: ${isEmpty}`);
                }
            });

            // 备用方法: 尝试直接访问构造函数的属性定义
            if (properties.length === 0 && constructor.__props__) {
                constructor.__props__.forEach(prop => {
                    if (prop.name && prop.type &&
                        typeof prop.type === 'function' &&
                        cc.js.isChildClassOf(prop.type, cc.Component)) {

                        properties.push({
                            name: prop.name,
                            type: prop.type,
                            typeName: cc.js.getClassName(prop.type),
                            currentValue: component[prop.name],
                            isNull: this.isPropertyEmpty(component[prop.name])
                        });
                    }
                });
            }

            logger.debug(`解析组件属性 [${className}]: 找到 ${properties.length} 个可挂载属性`);

        } catch (error) {
            logger.warn(`解析组件属性失败 [${className}]: ${error.message}`);
        }

        return properties;
    }

    /**
     * 检查属性是否为空（包括 Missing Reference）
     * @param {*} value 属性值
     * @returns {boolean} 是否为空
     */
    isPropertyEmpty(value) {
        // 标准的 null/undefined 检查
        if (value === null || value === undefined) {
            return true;
        }

        // 🔧 使用 cc.isValid() 检查 Cocos Creator 对象的有效性
        try {
            // 优先使用 cc.isValid() 全局函数
            if (typeof cc !== 'undefined' && typeof cc.isValid === 'function') {
                if (!cc.isValid(value)) {
                    return true;
                }
            }

            // 备用检查：对象自身的 isValid 方法
            if (value && typeof value === 'object' && typeof value.isValid === 'function') {
                if (!value.isValid()) {
                    return true;
                }
            }

            // 检查是否是被销毁的对象
            if (value && typeof value === 'object' && value._destroyed === true) {
                return true;
            }

        } catch (error) {
            // 如果检查过程中出错，认为是无效引用
            logger.debug(`属性有效性检查出错: ${error.message}`);
            return true;
        }

        return false;
    }

    /**
     * 名称匹配算法
     * @param {string} propertyName 属性名
     * @param {string} nodeName 节点名
     * @param {Object} options 匹配选项
     * @returns {Object} 匹配结果
     */
    matchNodeName(propertyName, nodeName, options = {}) {
        const {
            ignoreCase = true,           // 忽略大小写
            flexibleMatching = true      // 字母顺序匹配
        } = options;

        if (!propertyName || !nodeName) {
            return { match: false, score: 0, type: 'none' };
        }

        // 准备比较用的字符串
        const propName = ignoreCase ? propertyName.toLowerCase() : propertyName;
        const nodeNameComp = ignoreCase ? nodeName.toLowerCase() : nodeName;

        // 1. 精确匹配 - 最高优先级
        if (propName === nodeNameComp) {
            return { match: true, score: 100, type: 'exact' };
        }

        // 2. 灵活匹配 - 字母顺序相同，允许中间有符号
        if (flexibleMatching) {
            const result = this.flexibleLetterMatch(propName, nodeNameComp);
            if (result.match) {
                return result;
            }
        }

        return { match: false, score: 0, type: 'none' };
    }

    /**
     * 灵活字母匹配算法
     * 检查两个字符串的字母是否按相同顺序出现，忽略中间的符号
     * 🔧 改进：要求字母数量和顺序完全一致，不允许子序列匹配
     * @param {string} propName 属性名（已处理大小写）
     * @param {string} nodeName 节点名（已处理大小写）
     * @returns {Object} 匹配结果
     */
    flexibleLetterMatch(propName, nodeName) {
        // 提取字母序列
        const propLetters = propName.replace(/[^a-z]/g, '');
        const nodeLetters = nodeName.replace(/[^a-z]/g, '');

        // 🔧 严格匹配：字母数量和顺序必须完全一致
        if (propLetters === nodeLetters) {
            // 计算匹配度：字母越多，分隔符越少，分数越高
            const letterCount = propLetters.length;
            const propSeparators = propName.length - letterCount;
            const nodeSeparators = nodeName.length - letterCount;
            const totalSeparators = propSeparators + nodeSeparators;

            // 基础分数95，根据分隔符数量调整（分隔符越少分数越高）
            const score = Math.max(85, 95 - totalSeparators);

            return { match: true, score: score, type: 'flexible_exact' };
        }

        // 🚫 移除子序列匹配，避免 label 匹配到 lAbel_Out_dsA
        return { match: false, score: 0, type: 'none' };
    }

    /**
     * 检查字符串 a 是否是字符串 b 的子序列
     * @param {string} a 子序列
     * @param {string} b 主序列
     * @returns {boolean}
     */
    isSubsequence(a, b) {
        let i = 0, j = 0;
        while (i < a.length && j < b.length) {
            if (a[i] === b[j]) {
                i++;
            }
            j++;
        }
        return i === a.length;
    }

    /**
     * 在节点上查找指定类型的组件
     * @param {cc.Node} node 节点
     * @param {Function} componentType 组件类型
     * @returns {cc.Component|null} 找到的组件
     */
    findComponentOnNode(node, componentType) {
        if (!node || !componentType) return null;

        try {
            return node.getComponent(componentType);
        } catch (error) {
            logger.warn(`查找组件失败 [${node.name}]: ${error.message}`);
            return null;
        }
    }

    /**
     * 在子树中查找最佳匹配节点
     * @param {cc.Node} searchRoot 搜索起始节点
     * @param {Object} prop 属性信息
     * @param {Object} options 匹配选项
     * @param {Set} visited 已访问节点集合（跨调用共享）
     * @returns {Object|null} 最佳匹配结果
     */
    findBestMatchInSubtree(searchRoot, prop, options, visited) {
        let bestMatch = null;
        let bestScore = 0;

        this.traverseNodeTree(searchRoot, (node) => {
            const matchResult = this.matchNodeName(prop.name, node.name, options);

            if (matchResult.match && matchResult.score > bestScore) {
                let targetObject = null;

                // 如果属性类型是 cc.Node，直接使用节点
                if (prop.type === cc.Node || cc.js.isChildClassOf(prop.type, cc.Node)) {
                    targetObject = node;
                } else {
                    // 否则在节点上查找对应的组件
                    targetObject = this.findComponentOnNode(node, prop.type);
                }

                if (targetObject) {
                    bestMatch = {
                        node: node,
                        component: targetObject,
                        matchResult: matchResult
                    };
                    bestScore = matchResult.score;
                }
            }
        }, visited);

        return bestMatch;
    }

    /**
     * 执行自动属性挂载（两阶段就近优先搜索）
     * Phase 1: 从当前节点向下搜索子树
     * Phase 2: 从当前节点向上逐级搜索祖先子树，首个找到匹配的层级即停止
     * @param {cc.Component} component 目标组件
     * @param {cc.Node} currentNode 当前节点（搜索起点）
     * @param {Object} options 挂载选项
     * @returns {Array} 挂载结果
     */
    autoMountProperties(component, currentNode, options = {}) {
        this.mountResults = [];
        const pendingMounts = [];

        if (!component || !currentNode) {
            logger.warn('自动挂载: 组件或当前节点为空');
            return { mountResults: this.mountResults, pendingMounts: pendingMounts };
        }

        const properties = this.parseComponentProperties(component);
        const componentName = cc.js.getClassName(component.constructor);

        logger.info(`开始自动挂载 [${componentName}] 的属性，共 ${properties.length} 个属性（就近优先搜索）`);

        // 统计信息
        let alreadyMountedCount = 0;
        let newlyMountedCount = 0;
        let pendingCount = 0;
        let notFoundCount = 0;

        properties.forEach(prop => {
            logger.debug(`检查属性 [${prop.name}]:`);
            logger.debug(`  - 当前值: ${prop.currentValue === null ? 'null' : (prop.currentValue === undefined ? 'undefined' : typeof prop.currentValue)}`);
            logger.debug(`  - cc.isValid(): ${typeof cc !== 'undefined' && typeof cc.isValid === 'function' ? cc.isValid(prop.currentValue) : 'N/A'}`);
            logger.debug(`  - isNull标记: ${prop.isNull}`);

            // 跳过已挂载的属性
            if (!prop.isNull) {
                logger.debug(`属性 [${prop.name}] 已挂载，跳过`);
                alreadyMountedCount++;
                return;
            }

            logger.debug(`属性 [${prop.name}] 需要挂载，开始就近搜索`);

            // 为每个属性创建独立的 visited Set，跨两阶段共享
            const visited = new Set();
            let bestMatch = null;
            let fromPhase2 = false;

            // Phase 1: 从当前节点向下搜索子树
            logger.debug(`  Phase 1: 搜索当前节点 [${currentNode.name}] 的子树`);
            bestMatch = this.findBestMatchInSubtree(currentNode, prop, options, visited);

            // Phase 2: 向上逐级搜索祖先节点的子树
            if (!bestMatch) {
                let searchNode = currentNode.parent;
                while (searchNode) {
                    logger.debug(`  Phase 2: 搜索祖先节点 [${searchNode.name}] 的子树`);
                    bestMatch = this.findBestMatchInSubtree(searchNode, prop, options, visited);
                    if (bestMatch) {
                        fromPhase2 = true;
                        break;
                    }
                    searchNode = searchNode.parent;
                }
            }

            if (bestMatch) {
                if (fromPhase2) {
                    // Phase 2 结果不自动挂载，收集到 pendingMounts
                    pendingMounts.push({
                        property: prop.name,
                        propertyType: prop.typeName,
                        node: bestMatch.node,
                        component: bestMatch.component,
                        nodeName: bestMatch.node.name,
                        nodeUuid: bestMatch.node.uuid,
                        matchType: bestMatch.matchResult.type,
                        matchScore: bestMatch.matchResult.score
                    });
                    logger.info(`属性待确认挂载(祖先子树): ${prop.name} -> ${bestMatch.node.name} (${bestMatch.matchResult.type})`);
                    pendingCount++;
                } else {
                    // Phase 1 结果直接挂载
                    try {
                        component[prop.name] = bestMatch.component;

                        const result = {
                            property: prop.name,
                            propertyType: prop.typeName,
                            nodeName: bestMatch.node.name,
                            nodeUuid: bestMatch.node.uuid,
                            matchType: bestMatch.matchResult.type,
                            matchScore: bestMatch.matchResult.score,
                            success: true,
                            error: null
                        };

                        this.mountResults.push(result);
                        logger.info(`属性挂载成功: ${prop.name} -> ${bestMatch.node.name} (${bestMatch.matchResult.type})`);
                        newlyMountedCount++;

                    } catch (error) {
                        const result = {
                            property: prop.name,
                            propertyType: prop.typeName,
                            nodeName: bestMatch.node.name,
                            nodeUuid: bestMatch.node.uuid,
                            matchType: bestMatch.matchResult.type,
                            matchScore: bestMatch.matchResult.score,
                            success: false,
                            error: error.message
                        };

                        this.mountResults.push(result);
                        logger.error(`属性挂载失败: ${prop.name} -> ${bestMatch.node.name}: ${error.message}`);
                    }
                }
            } else {
                logger.debug(`未找到匹配的节点: ${prop.name} (${prop.typeName})`);
                notFoundCount++;
            }
        });

        // 输出总结信息
        if (properties.length > 0) {
            const totalProperties = properties.length;
            logger.info(`属性挂载总结: 总共 ${totalProperties} 个属性 - 已挂载 ${alreadyMountedCount} 个，新挂载 ${newlyMountedCount} 个，待确认 ${pendingCount} 个，未找到 ${notFoundCount} 个`);
        }

        return { mountResults: this.mountResults, pendingMounts: pendingMounts };
    }

    /**
     * 确认并执行待挂载的属性
     * @param {cc.Component} component 目标组件
     * @param {Array} pendingMounts 待挂载列表（来自 autoMountProperties 返回的 pendingMounts）
     * @returns {Array} 挂载结果数组（与 mountResults 格式一致）
     */
    applyPendingMounts(component, pendingMounts) {
        const results = [];

        if (!component || !pendingMounts || pendingMounts.length === 0) {
            return results;
        }

        const componentName = cc.js.getClassName(component.constructor);
        logger.info(`开始应用待确认挂载 [${componentName}]，共 ${pendingMounts.length} 个`);

        pendingMounts.forEach(pending => {
            try {
                component[pending.property] = pending.component;

                const result = {
                    property: pending.property,
                    propertyType: pending.propertyType,
                    nodeName: pending.nodeName,
                    nodeUuid: pending.nodeUuid,
                    matchType: pending.matchType,
                    matchScore: pending.matchScore,
                    success: true,
                    error: null
                };

                results.push(result);
                this.mountResults.push(result);
                logger.info(`待确认属性挂载成功: ${pending.property} -> ${pending.nodeName} (${pending.matchType})`);

            } catch (error) {
                const result = {
                    property: pending.property,
                    propertyType: pending.propertyType,
                    nodeName: pending.nodeName,
                    nodeUuid: pending.nodeUuid,
                    matchType: pending.matchType,
                    matchScore: pending.matchScore,
                    success: false,
                    error: error.message
                };

                results.push(result);
                this.mountResults.push(result);
                logger.error(`待确认属性挂载失败: ${pending.property} -> ${pending.nodeName}: ${error.message}`);
            }
        });

        return results;
    }

    /**
     * 获取挂载统计信息
     * @returns {Object} 统计信息
     */
    getMountStatistics(pendingMounts) {
        const total = this.mountResults.length;
        const successful = this.mountResults.filter(r => r.success).length;
        const failed = total - successful;
        const pendingCount = (pendingMounts && pendingMounts.length) || 0;

        return {
            total,
            successful,
            failed,
            pendingCount,
            successRate: total > 0 ? Math.round((successful / total) * 100) : 0
        };
    }

    /**
     * 格式化挂载结果日志
     * @param {string} nodeName 节点名称
     * @param {string} componentName 组件名称
     * @returns {string} 格式化的日志信息
     */
    formatMountResultLog(nodeName, componentName, pendingMounts) {
        const stats = this.getMountStatistics(pendingMounts);

        if (stats.total === 0 && stats.pendingCount === 0) {
            return `智能组件管理器: 组件 [${componentName}] 无需挂载属性`;
        }

        const messages = [
            `智能组件管理器: 节点 [${nodeName}] 的组件 [${componentName}] 属性挂载完成`,
            `挂载统计: ${stats.successful}/${stats.total} 成功 (${stats.successRate}%)，待确认 ${stats.pendingCount} 个`
        ];

        if (stats.successful > 0) {
            const successfulMounts = this.mountResults
                .filter(r => r.success)
                .map(r => `${r.property} -> ${r.nodeName}`)
                .join(', ');
            messages.push(`成功挂载: ${successfulMounts}`);
        }

        if (stats.failed > 0) {
            const failedMounts = this.mountResults
                .filter(r => !r.success)
                .map(r => `${r.property} (${r.error})`)
                .join(', ');
            messages.push(`挂载失败: ${failedMounts}`);
        }

        if (stats.pendingCount > 0 && pendingMounts) {
            const pendingList = pendingMounts
                .map(p => `${p.property} -> ${p.nodeName}`)
                .join(', ');
            messages.push(`待确认挂载(祖先子树): ${pendingList}`);
        }

        return messages.join('\n');
    }
}

module.exports = PropertyMounter;
