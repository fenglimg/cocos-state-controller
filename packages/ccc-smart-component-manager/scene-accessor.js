/*
 * @Author: dogking18 (dogking18@163.com)
 * @Date: 2022-10-28 11:21
 * @Last Modified by: AI Assistant (Enhanced Version)
 * @Last Modified time: 2025-07-19
 */

// 🔧 添加防护性检查，避免加载时错误
let searchEngine, dataManager, logger;

try {
    // 检查模块是否存在
    if (typeof require !== 'undefined') {
        // 引入增强的搜索引擎
        searchEngine = require('./search-engine');
        // 引入数据管理器
        dataManager = require('./data-manager');
        // 引入日志管理器
        logger = require('./logger');
    } else {
        throw new Error('require function not available');
    }
} catch (error) {
    console.warn('ccc-smart-component-manager: 模块加载警告:', error.message);
    // 提供默认的日志对象，避免后续错误
    logger = {
        info: console.log,
        debug: console.log,
        warn: console.warn,
        error: console.error,
        success: console.log
    };
    // 提供默认的搜索引擎和数据管理器
    searchEngine = null;
    dataManager = null;
}
class ComponentOption {
    nodeUuids = [];
    comName = "";
};

class InputMatch {
    input = "";
    index = -1;
    origin = "";
    score = 0;          // 匹配分数
    type = "";          // 匹配类型：exact, prefix, contains, pinyin, fuzzy
    matchLength = 0;    // 匹配长度
};

module.exports = {
    'add-component': function (event, comName) {
        let comOpt = new ComponentOption();
        comOpt.comName = comName;
        let addedCount = 0;
        let totalMountResults = [];

        if (Editor.Selection.curSelection("node")) {
            Editor.Selection.curSelection("node").forEach(uuid => {
                let node = this.getNodeByUuid(uuid);
                try {
                    const component = node.addComponent(comName);
                    logger.info(`智能组件管理器: 为节点 [${node.name}] 添加组件 [${comName}]`);

                    // 🆕 自动属性挂载功能
                    if (dataManager.getAutoMountEnabled() && component) {
                        this.performAutoMount(component, node, comName, totalMountResults);
                    }

                    comOpt.nodeUuids.push(node.uuid);
                    addedCount++;
                } catch (error) {
                    logger.error(`智能组件管理器: 为节点 [${node.name}] 添加组件 [${comName}] 失败: ${error.message}`);
                }
            });
        }

        // 只有成功添加了组件才记录使用次数
        if (addedCount > 0) {
            try {
                const beforeCount = dataManager.getUsageCount(comName);
                dataManager.recordUsage(comName);
                const afterCount = dataManager.getUsageCount(comName);

                if (afterCount === beforeCount + 1) {
                    logger.info(`记录组件使用: ${comName}, 当前使用次数: ${afterCount}`);
                } else {
                    logger.warn(`组件使用记录异常 ${comName}, 期望: ${beforeCount + 1}, 实际: ${afterCount}`);
                }
            } catch (error) {
                logger.error(`记录组件使用失败: ${comName}, 错误: ${error.message}`);
            }

            // 🆕 显示总体挂载统计
            if (dataManager.getAutoMountEnabled() && totalMountResults.length > 0) {
                const successfulMounts = totalMountResults.filter(r => r.success).length;
                const totalMounts = totalMountResults.length;
                const successRate = Math.round((successfulMounts / totalMounts) * 100);

                logger.info(`智能组件管理器: 属性挂载总结 - ${successfulMounts}/${totalMounts} 成功 (${successRate}%)`);

                // 如果有属性成功挂载，标记场景为已修改
                if (successfulMounts > 0) {
                    Editor.Ipc.sendToMain('scene:set-dirty');
                }
            }
        }

        Editor.Ipc.sendToPanel('ccc-smart-component-manager', 'ccc-smart-component-manager:res-add-component', comOpt);
    },
    'del-component': function (event, comOpt) {
        // 只删除一个组件实例（精确匹配类型）
        if (comOpt.nodeUuids && comOpt.nodeUuids.length > 0) {
            // 从第一个节点删除第一个找到的该类型组件
            let nodeUuid = comOpt.nodeUuids[0];
            let node = this.getNodeByUuid(nodeUuid);
            if (node && node._components) {
                // 查找精确匹配的组件
                let targetComponent = null;
                for (let com of node._components) {
                    if (com) {
                        let className = cc.js.getClassName(com.constructor);
                        if (className === comOpt.comName) {
                            targetComponent = com;
                            break;
                        }
                    }
                }

                if (targetComponent) {
                    targetComponent.destroy();
                    logger.info(`智能组件管理器: 已删除节点 [${node.name}] 的组件 [${comOpt.comName}]（精确匹配）`);
                } else {
                    logger.info(`智能组件管理器: 未找到要删除的组件 [${comOpt.comName}]`);
                }
            }
        }
        Editor.Ipc.sendToPanel('ccc-smart-component-manager', 'ccc-smart-component-manager:res-del-component', comOpt.comName);
    },
    'del-all-components': function (event, comOpt) {
        // 删除所有选中节点上的该类型组件（只删除精确匹配的类型，不删除继承的子类）
        let deletedCount = 0;
        if (comOpt.nodeUuids && comOpt.nodeUuids.length > 0) {
            comOpt.nodeUuids.forEach(nodeUuid => {
                let node = this.getNodeByUuid(nodeUuid);
                if (node && node._components) {
                    // 遍历所有组件，只删除精确匹配类名的组件
                    const componentsToDelete = [];
                    node._components.forEach(com => {
                        if (com) {
                            let className = cc.js.getClassName(com.constructor);
                            // 只删除精确匹配的组件类型，不删除继承的子类
                            if (className === comOpt.comName) {
                                componentsToDelete.push(com);
                            }
                        }
                    });

                    // 删除找到的组件
                    componentsToDelete.forEach(com => {
                        com.destroy();
                        deletedCount++;
                    });
                }
            });
            logger.info(`智能组件管理器: 已删除 ${deletedCount} 个 [${comOpt.comName}] 组件（精确匹配）`);
        }
        Editor.Ipc.sendToPanel('ccc-smart-component-manager', 'ccc-smart-component-manager:res-del-component', comOpt.comName);
    },
    'list-current-components': function (event) {
        try {
            let comOptionCol = {};
            const selectedNodes = Editor.Selection.curSelection("node");

            if (!selectedNodes || selectedNodes.length === 0) {
                // 即使没有选中节点也要发送响应，避免超时
                Editor.Ipc.sendToPanel('ccc-smart-component-manager', 'ccc-smart-component-manager:res-list-current-components', comOptionCol);
                return;
            }
            const nodesToProcess = selectedNodes;
            // 统计每个组件在所有选中节点上的实例数量
            nodesToProcess.forEach(uuid => {
                try {
                    let node = this.getNodeByUuid(uuid);
                    if (node && node._components) {
                        node._components.forEach(com => {
                            try {
                                let className = cc.js.getClassName(com.constructor);
                                if (className) {
                                    let co = comOptionCol[className];
                                    if (!co) {
                                        co = new ComponentOption();
                                        co.comName = className;
                                        comOptionCol[co.comName] = co;
                                    }
                                    // 只记录节点UUID，不传输组件实例
                                    co.nodeUuids.push(node.uuid);
                                }
                            } catch (compError) {
                                logger.error(`智能组件管理器: 处理组件时出错: ${compError.message}`);
                            }
                        });
                    }
                } catch (nodeError) {
                    logger.error(`智能组件管理器: 处理节点 ${uuid} 时出错: ${nodeError.message}`);
                }
            });

            Editor.Ipc.sendToPanel('ccc-smart-component-manager', 'ccc-smart-component-manager:res-list-current-components', comOptionCol);
        } catch (error) {
            logger.warn(`list-current-components 处理失败: ${error.message}`);
            // 发送空结果避免超时
            Editor.Ipc.sendToPanel('ccc-smart-component-manager', 'ccc-smart-component-manager:res-list-current-components', {});
        }
    },
    'input-query': function (event, handle) {
        try {
            let comName = handle.comName;
            let matchs = [];

            if (comName && comName.length > 0) {
                // 使用增强的搜索引擎
                matchs = searchEngine.searchComponents(comName, cc.js._registeredClassNames);

                // 为了保持与原有接口的兼容性，确保每个结果都有必要的字段
                matchs = matchs.map(match => {
                    try {
                        let inputMatch = new InputMatch();
                        inputMatch.input = match.input;
                        inputMatch.origin = match.origin;
                        inputMatch.displayName = match.displayName; // 新增显示名称字段
                        inputMatch.index = match.index;
                        inputMatch.score = match.score; // 新增分数字段
                        inputMatch.type = match.type;   // 新增匹配类型字段
                        inputMatch.matchLength = match.matchLength; // 新增匹配长度字段
                        inputMatch.isFavorite = match.isFavorite; // 新增收藏状态字段
                        inputMatch.isFrequent = match.isFrequent; // 新增高频状态字段
                        inputMatch.usageCount = match.usageCount; // 新增使用次数字段
                        return inputMatch;
                    } catch (matchError) {
                        logger.error(`智能组件管理器: 处理搜索结果项时出错: ${matchError.message}`);
                        return null;
                    }
                }).filter(match => match !== null); // 过滤掉处理失败的项
            } else {
                // 空输入时显示收藏组件
                const favoriteComponents = searchEngine.getFavoriteComponents(cc.js._registeredClassNames);

                // 转换为InputMatch格式以保持兼容性
                matchs = favoriteComponents.map(match => {
                    try {
                        let inputMatch = new InputMatch();
                        inputMatch.input = ""; // 空输入
                        inputMatch.origin = match.origin;
                        inputMatch.displayName = match.displayName;
                        inputMatch.index = 0;
                        inputMatch.score = match.score;
                        inputMatch.type = match.type;
                        inputMatch.matchLength = 0;
                        inputMatch.isFavorite = match.isFavorite;
                        inputMatch.isFrequent = match.isFrequent;
                        inputMatch.usageCount = match.usageCount;
                        return inputMatch;
                    } catch (matchError) {
                        logger.error(`智能组件管理器: 处理收藏组件项时出错: ${matchError.message}`);
                        return null;
                    }
                }).filter(match => match !== null);
            }

            Editor.Ipc.sendToPanel('ccc-smart-component-manager', 'ccc-smart-component-manager:res-input-query', matchs);
        } catch (error) {
            logger.warn(`input-query 处理失败: ${error.message}`);
            // 发送空结果避免界面卡住
            Editor.Ipc.sendToPanel('ccc-smart-component-manager', 'ccc-smart-component-manager:res-input-query', []);
        }
    },

    // 🆕 调整组件顺序 - 简化版本，直接使用UI索引
    'move-component': function (event, data) {
        try {
            const { nodeUuid, componentName, fromIndex, toIndex } = data;

            if (!nodeUuid || !componentName || fromIndex === undefined || toIndex === undefined) {
                logger.error('移动组件: 参数不完整');
                return;
            }

            const node = this.getNodeByUuid(nodeUuid);
            if (!node || !node._components) {
                logger.error(`移动组件: 未找到节点 ${nodeUuid}`);
                return;
            }

            const components = node._components;

            // 查找要移动的组件
            let componentToMove = null;
            let currentRealIndex = -1;

            for (let i = 0; i < components.length; i++) {
                const comp = components[i];
                if (comp && cc.js.getClassName(comp.constructor) === componentName) {
                    componentToMove = comp;
                    currentRealIndex = i;
                    break;
                }
            }

            if (!componentToMove || currentRealIndex === -1) {
                logger.warn(`移动组件: 节点上未找到组件 [${componentName}]`);
                return;
            }

            // 计算目标位置 - 基于UI索引的简单移动
            let targetRealIndex;
            if (toIndex > fromIndex) {
                // 向右移动
                targetRealIndex = Math.min(currentRealIndex + 1, components.length - 1);
            } else {
                // 向左移动
                targetRealIndex = Math.max(currentRealIndex - 1, 0);
            }

            if (currentRealIndex === targetRealIndex) {
                logger.info(`移动组件: 组件已在边界位置，无法移动`);
                return;
            }

            // 执行移动
            components.splice(currentRealIndex, 1); // 移除组件
            components.splice(targetRealIndex, 0, componentToMove); // 插入到新位置

            logger.info(`智能组件管理器: 已将组件 [${componentName}] 从位置 ${currentRealIndex} 移动到位置 ${targetRealIndex}`);

            // 标记场景为已修改
            Editor.Ipc.sendToMain('scene:set-dirty');

            // 通知面板刷新
            Editor.Ipc.sendToPanel('ccc-smart-component-manager', 'ccc-smart-component-manager:component-moved', {
                success: true,
                componentName: componentName,
                fromIndex: currentRealIndex,
                toIndex: targetRealIndex
            });

        } catch (error) {
            logger.error(`移动组件失败: ${error.message}`);
            Editor.Ipc.sendToPanel('ccc-smart-component-manager', 'ccc-smart-component-manager:component-moved', {
                success: false,
                error: error.message
            });
        }
    },

    // 🆕 获取组件索引信息
    'get-component-indices': function (event, data) {
        try {
            const { nodeUuid, draggedComponentName, targetComponentName } = data;

            if (!nodeUuid || !draggedComponentName || !targetComponentName) {
                event.reply('参数不完整');
                return;
            }

            const node = this.getNodeByUuid(nodeUuid);
            if (!node || !node._components) {
                event.reply(`未找到节点 ${nodeUuid}`);
                return;
            }

            const components = node._components;
            let fromIndex = -1;
            let toIndex = -1;

            // 查找拖拽组件和目标组件的索引
            for (let i = 0; i < components.length; i++) {
                const comp = components[i];
                if (comp) {
                    const className = cc.js.getClassName(comp.constructor);
                    if (className === draggedComponentName && fromIndex === -1) {
                        fromIndex = i;
                    }
                    if (className === targetComponentName && toIndex === -1) {
                        toIndex = i;
                    }
                }
            }

            event.reply(null, {
                fromIndex: fromIndex,
                toIndex: toIndex,
                totalComponents: components.length
            });

        } catch (error) {
            logger.error(`获取组件索引失败: ${error.message}`);
            event.reply(error.message);
        }
    },

    'get-node-components': function (event) {
        let components = [];
        if (Editor.Selection.curSelection("node")) {
            Editor.Selection.curSelection("node").forEach(uuid => {
                let node = this.getNodeByUuid(uuid);
                if (node) {
                    node._components.forEach(com => {
                        let className = cc.js.getClassName(com.constructor);
                        if (!components.includes(className)) {
                            components.push(className);
                        }
                    });
                }
            });
        }

        if (event.reply) {
            event.reply(null, components);
        }
    },

    getNodeByUuid(uuid) {
        let found = null;
        let _find = (node) => {
            node.children.forEach(child => {
                if (child.uuid == uuid) {
                    found = child;
                    return;
                }
                if (child.children.length > 0) {
                    _find(child);
                }
            });
        };

        _find(cc.director.getScene());
        return found;
    },

    // 执行自动属性挂载
    performAutoMount(component, node, comName, totalMountResults) {
        try {
            // 延迟加载 PropertyMounter 以避免循环依赖
            const PropertyMounter = require('./property-mounter');
            const propertyMounter = new PropertyMounter();
            const mountConfig = dataManager.getAutoMountConfig();

            // 执行自动挂载，从当前节点开始就近搜索
            const { mountResults, pendingMounts } = propertyMounter.autoMountProperties(component, node, {
                ignoreCase: mountConfig.ignoreCase,
                flexibleMatching: mountConfig.flexibleMatching
            });

            // 将结果添加到总结果中
            if (Array.isArray(totalMountResults)) {
                totalMountResults.push(...mountResults);
            }

            // 显示挂载结果日志
            if (mountConfig.showMountLog && (mountResults.length > 0 || pendingMounts.length > 0)) {
                const logMessage = propertyMounter.formatMountResultLog(node.name, comName, pendingMounts);
                logger.info(logMessage);
            }

            // 如果有属性成功挂载，标记场景为已修改
            const successfulMounts = mountResults.filter(r => r.success).length;
            if (successfulMounts > 0) {
                Editor.Ipc.sendToMain('scene:set-dirty');
            }

            return { mountResults, pendingMounts };

        } catch (mountError) {
            logger.error(`智能组件管理器: 自动属性挂载失败 [${node.name}]: ${mountError.message}`);
            return [];
        }
    },

    // 手动执行自动挂载
    'execute-auto-mount': function (event, data) {
        try {
            const { nodeUuid, nodeName } = data;
            const node = this.getNodeByUuid(nodeUuid);

            if (!node) {
                logger.error(`未找到节点: ${nodeName} (${nodeUuid})`);
                event.reply(new Error(`未找到节点: ${nodeName}`));
                return;
            }

            if (!dataManager.getAutoMountEnabled()) {
                logger.warn('自动挂载功能已禁用');
                event.reply(new Error('自动挂载功能已禁用'));
                return;
            }

            logger.info(`开始对节点 [${node.name}] 执行手动自动挂载...`);

            // 获取节点上的所有组件
            const components = node._components || [];
            let allMountResults = [];
            let allPendingMounts = []; // 收集所有跨范围的待挂载项

            components.forEach(component => {
                if (component && component.constructor && component.constructor !== cc.Component) {
                    const componentName = cc.js.getClassName(component.constructor);
                    logger.debug(`处理组件: ${componentName}`);

                    const result = this.performAutoMount(component, node, componentName, []);
                    allMountResults = allMountResults.concat(result.mountResults || []);

                    // 收集跨范围待挂载项，附带组件引用
                    if (result.pendingMounts && result.pendingMounts.length > 0) {
                        allPendingMounts.push({
                            component: component,
                            componentName: componentName,
                            pendingMounts: result.pendingMounts
                        });
                    }
                }
            });

            // 如果有跨范围的待挂载项，弹出确认对话框
            if (allPendingMounts.length > 0) {
                const confirmedResults = this.showOutOfScopeMountDialog(node, allPendingMounts);
                allMountResults = allMountResults.concat(confirmedResults);
            }

            logger.info(`节点 [${node.name}] 手动自动挂载完成，处理了 ${allMountResults.length} 个属性`);
            event.reply(null, allMountResults);

        } catch (error) {
            logger.error(`手动自动挂载失败: ${error.message}`);
            event.reply(error);
        }
    },

    // 对指定组件执行自动挂载
    'execute-auto-mount-component': function (event, data) {
        try {
            const { nodeUuid, componentName } = data;
            const node = this.getNodeByUuid(nodeUuid);

            if (!node) {
                logger.error(`未找到节点: ${nodeUuid}`);
                return;
            }

            if (!dataManager.getAutoMountEnabled()) {
                logger.warn('自动挂载功能已禁用');
                return;
            }

            logger.info(`开始对节点 [${node.name}] 的组件 [${componentName}] 执行自动挂载...`);

            // 🔧 查找所有指定类型的组件（不只是第一个）
            const components = node._components || [];
            const targetComponents = components.filter(comp => {
                return comp && comp.constructor &&
                    cc.js.getClassName(comp.constructor) === componentName;
            });

            if (targetComponents.length === 0) {
                logger.warn(`节点 [${node.name}] 上未找到组件 [${componentName}]`);
                return;
            }

            logger.info(`节点 [${node.name}] 上找到 ${targetComponents.length} 个 [${componentName}] 组件`);

            // 🔧 对每个匹配的组件执行自动挂载
            let allMountResults = [];
            let allPendingMounts = [];
            let totalSuccessful = 0;

            targetComponents.forEach((targetComponent, index) => {
                logger.info(`处理第 ${index + 1} 个 [${componentName}] 组件...`);

                const result = this.performAutoMount(targetComponent, node, componentName, []);
                const mountResults = result.mountResults || [];
                allMountResults = allMountResults.concat(mountResults);

                const successful = mountResults.filter(r => r.success).length;
                totalSuccessful += successful;

                if (mountResults.length > 0) {
                    logger.info(`第 ${index + 1} 个组件挂载结果: ${successful}/${mountResults.length} 个属性挂载成功`);
                } else {
                    logger.info(`第 ${index + 1} 个组件无新属性需要挂载`);
                }

                // 收集跨范围待挂载项
                if (result.pendingMounts && result.pendingMounts.length > 0) {
                    allPendingMounts.push({
                        component: targetComponent,
                        componentName: componentName,
                        pendingMounts: result.pendingMounts
                    });
                }
            });

            // 如果有跨范围的待挂载项，弹出确认对话框
            if (allPendingMounts.length > 0) {
                const confirmedResults = this.showOutOfScopeMountDialog(node, allPendingMounts);
                allMountResults = allMountResults.concat(confirmedResults);
                totalSuccessful += confirmedResults.filter(r => r.success).length;
            }

            // 显示总体结果
            if (allMountResults.length > 0) {
                logger.success(`所有 [${componentName}] 组件自动挂载完成: ${totalSuccessful}/${allMountResults.length} 个属性挂载成功`);
                if (totalSuccessful > 0) {
                    Editor.Ipc.sendToMain('scene:set-dirty');
                }
            } else {
                logger.info(`所有 [${componentName}] 组件均无新属性需要挂载`);
            }

        } catch (error) {
            logger.error(`组件自动挂载失败: ${error.message}`);
        }
    },

    // 显示跨范围挂载确认对话框（同步调用，返回挂载结果）
    showOutOfScopeMountDialog(currentNode, allPendingMounts) {
        // 构建待挂载属性列表描述
        const pendingDetails = [];
        allPendingMounts.forEach(item => {
            item.pendingMounts.forEach(pending => {
                pendingDetails.push(`• ${item.componentName}.${pending.property} → 节点 [${pending.nodeName}]`);
            });
        });

        const totalPending = pendingDetails.length;
        const message = `在节点 [${currentNode.name}] 的子树范围外找到 ${totalPending} 个匹配属性：\n\n${pendingDetails.join('\n')}\n\n这些属性位于当前节点范围之外（兄弟节点或父节点），是否确认挂载？`;

        // 同步调用 Editor.Dialog，返回按钮索引
        const response = Editor.Dialog.messageBox({
            type: "warning",
            title: "跨范围属性挂载确认",
            message: message,
            buttons: ["取消", "确认挂载"],
            defaultId: 0,
            cancelId: 0,
        });

        if (response === 1) {
            // 用户确认挂载
            const PropertyMounter = require('./property-mounter');
            const propertyMounter = new PropertyMounter();
            let confirmedResults = [];

            allPendingMounts.forEach(item => {
                const results = propertyMounter.applyPendingMounts(item.component, item.pendingMounts);
                confirmedResults = confirmedResults.concat(results);
            });

            logger.info(`跨范围挂载完成: ${confirmedResults.filter(r => r.success).length}/${confirmedResults.length} 个属性挂载成功`);

            if (confirmedResults.filter(r => r.success).length > 0) {
                Editor.Ipc.sendToMain('scene:set-dirty');
            }

            return confirmedResults;
        } else {
            // 用户取消
            logger.info(`用户取消了 ${totalPending} 个跨范围属性挂载`);
            return [];
        }
    },

    // 获取节点名称
    'get-node-names': function (event, nodeUuids) {
        try {
            if (!nodeUuids || !Array.isArray(nodeUuids)) {
                event.reply(null, []);
                return;
            }

            const nodeNames = nodeUuids.map(uuid => {
                try {
                    const node = this.getNodeByUuid(uuid);
                    return node ? node.name : `未知节点(${uuid.substring(0, 8)}...)`;
                } catch (error) {
                    logger.warn(`获取节点名称失败: ${uuid}, 错误: ${error.message}`);
                    return `错误节点(${uuid.substring(0, 8)}...)`;
                }
            });

            event.reply(null, nodeNames);
        } catch (error) {
            logger.error(`获取节点名称失败: ${error.message}`);
            event.reply(error, []);
        }
    }
};