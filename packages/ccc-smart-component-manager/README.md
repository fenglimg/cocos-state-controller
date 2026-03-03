# 智能组件管理器 (Smart Component Manager)

> 基于 add_component 的二次开发版本，提供更强大的组件搜索、管理和自动属性挂载功能。

## 📖 参考

1. **add_component** - dogking18 (原始插件)
2. **快速添加组件** - 陈皮皮 (功能参考)

## ✨ 核心功能

### 1. 智能组件搜索与添加

**功能入口**: 主面板搜索框
**描述**: 提供精确、高效的组件搜索和添加功能，支持多种匹配模式

**实现伪代码**:
```javascript
// 搜索引擎核心逻辑 (search-engine.js)
function searchComponents(input, componentRegistry) {
    const results = [];
    for (let componentName in componentRegistry) {
        if (isValidComponent(componentName)) {
            const matchResult = calculateMatchScore(input, componentName);
            if (matchResult) {
                // 添加收藏和使用频率权重加成
                const weightBonus = getWeightBonus(componentName);
                results.push({
                    name: componentName,
                    score: matchResult.score + weightBonus,
                    type: matchResult.type // exact, prefix, contains, fuzzy
                });
            }
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 20);
}

// 组件添加逻辑 (scene-accessor.js)
function addComponent(componentName) {
    const selectedNodes = Editor.Selection.curSelection("node");
    selectedNodes.forEach(nodeUuid => {
        const node = getNodeByUuid(nodeUuid);
        const component = node.addComponent(componentName);
        
        // 自动属性挂载
        if (autoMountEnabled && component) {
            performAutoMount(component, node);
        }
    });
}
```

**操作方式**:
- 输入组件名进行搜索
- 点击搜索结果或按回车键添加组件
- 支持批量添加到多个选中节点

### 2. 组件收藏系统

**功能入口**: 右键菜单 → "添加到收藏" / "取消收藏"
**描述**: 收藏常用组件，空搜索时优先显示收藏组件

**实现伪代码**:
```javascript
// 收藏管理 (data-manager.js)
class DataManager {
    addToFavorites(componentName) {
        if (!this.data.favorites.includes(componentName)) {
            this.data.favorites.push(componentName);
            this.saveData();
        }
    }
    
    getWeightBonus(componentName) {
        // 收藏组件获得权重加成
        return this.isFavorite(componentName) ? 100 : 0;
    }
}
```

### 3. 智能属性自动挂载 🆕

**功能入口**: 设置页面 → "启用自动属性挂载"
**描述**: 添加组件时自动查找并挂载同名或相似名称的节点组件

**实现伪代码**:
```javascript
// 自动挂载核心逻辑 (property-mounter.js)
function autoMountProperties(component, rootNode, options) {
    const properties = parseComponentProperties(component);
    const results = [];
    
    properties.forEach(prop => {
        if (prop.isNull && prop.type extends cc.Component) {
            // 在场景中查找匹配的节点
            const bestMatch = findBestMatchingNode(rootNode, prop.name, prop.type, options);
            if (bestMatch) {
                component[prop.name] = bestMatch.component;
                results.push({ success: true, property: prop.name, node: bestMatch.node.name });
            }
        }
    });
    
    return results;
}

// 节点名称匹配算法
function matchNodeName(propertyName, nodeName, options) {
    // 1. 完全匹配 (最高优先级)
    if (propertyName.toLowerCase() === nodeName.toLowerCase()) {
        return { match: true, score: 1000 };
    }
    
    // 2. 灵活匹配 (忽略符号分隔)
    if (options.flexibleMatching) {
        const propLetters = extractLetters(propertyName);
        const nodeLetters = extractLetters(nodeName);
        if (propLetters === nodeLetters) {
            return { match: true, score: 800 };
        }
    }
    
    // 3. 包含匹配
    if (nodeName.toLowerCase().includes(propertyName.toLowerCase())) {
        return { match: true, score: 600 };
    }
    
    return { match: false, score: 0 };
}
```

**配置选项**:
- `ignoreCase`: 忽略大小写差异
- `flexibleMatching`: 字母顺序匹配（允许中间有符号分隔）
- `showMountLog`: 显示挂载过程日志

### 4. 当前组件管理

**功能入口**: 主面板下方的"当前组件"区域
**描述**: 显示选中节点的所有组件，支持快速删除

**实现伪代码**:
```javascript
// 当前组件列表 (scene-accessor.js)
function listCurrentComponents() {
    const selectedNodes = Editor.Selection.curSelection("node");
    const componentMap = {};
    
    selectedNodes.forEach(nodeUuid => {
        const node = getNodeByUuid(nodeUuid);
        const components = node.getComponents(cc.Component);
        
        components.forEach(comp => {
            const className = cc.js.getClassName(comp.constructor);
            if (!componentMap[className]) {
                componentMap[className] = { count: 0, nodeUuids: [] };
            }
            componentMap[className].count++;
            componentMap[className].nodeUuids.push(nodeUuid);
        });
    });
    
    return componentMap;
}
```

### 5. 使用统计与智能推荐

**功能入口**: 设置页面 → "使用统计"
**描述**: 记录组件使用频率，为搜索结果提供智能排序

**实现伪代码**:
```javascript
// 使用统计 (data-manager.js)
function recordUsage(componentName) {
    if (!this.data.usage[componentName]) {
        this.data.usage[componentName] = 0;
    }
    this.data.usage[componentName]++;
    this.saveData();
}

function getUsageCount(componentName) {
    return this.data.usage[componentName] || 0;
}
```

## ⚠️ 注意事项

### 1. 场景监听限制
- **问题**: 暂时无法监听场景中组件的添加和删除事件
- **解决方案**: 手动删除组件后，点击刷新按钮(🔄)更新当前组件列表
- **影响**: 不影响插件的核心功能，仅需要手动刷新

### 2. 搜索结果限制
- **限制**: 搜索引擎最多返回20个结果
- **原因**: 防止性能问题和界面过载
- **建议**: 使用更精确的搜索关键词

### 3. 批量操作确认
- **触发条件**: 选中超过10个节点时添加组件
- **行为**: 弹出确认对话框防止误操作
- **目的**: 避免意外的大规模修改

### 4. 自动属性挂载注意事项
- **搜索范围**: 仅在当前场景根节点下搜索
- **匹配优先级**: 完全匹配 > 灵活匹配 > 包含匹配
- **性能考虑**: 大型场景可能影响挂载速度
- **安全性**: 只挂载空属性，不覆盖已有引用

## 🔧 技术架构

### 核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| 主入口 | `main.js` | 插件生命周期管理 |
| 场景访问器 | `scene-accessor.js` | 场景操作和组件管理 |
| 搜索引擎 | `search-engine.js` | 智能搜索和排序算法 |
| 数据管理器 | `data-manager.js` | 用户数据持久化 |
| 属性挂载器 | `property-mounter.js` | 自动属性挂载逻辑 |
| 用户界面 | `panel/index.js` | 面板UI和交互逻辑 |
| 日志管理器 | `logger.js` | 统一日志输出 |
| 国际化助手 | `i18n-helper.js` | 多语言支持 |

### 数据流

```
用户输入 → 搜索引擎 → 结果排序 → UI显示
    ↓
组件添加 → 场景访问器 → 自动挂载 → 数据统计
    ↓
使用记录 → 数据管理器 → 持久化存储
```

## 📦 安装与使用

### 安装步骤

1. 将插件文件夹复制到 Cocos Creator 项目的 `packages` 目录
2. 重启 Cocos Creator 或通过 `开发者 → 重新加载插件` 刷新
3. 通过菜单 `扩展 → 智能组件管理器 → 开启` 打开面板
4. 面板会自动停靠到检查器(Inspector)旁边

### 基本使用

1. **选择节点**: 在层级管理器中选择一个或多个节点
2. **搜索组件**: 在搜索框中输入组件名称
3. **添加组件**: 点击搜索结果或按回车键添加组件
4. **管理收藏**: 右键点击组件名称进行收藏操作

### 高级功能

#### 自动属性挂载设置
1. 点击设置按钮(⚙️)进入设置页面
2. 启用"自动属性挂载"功能
3. 配置匹配选项：
   - **忽略大小写**: 匹配时忽略大小写差异
   - **灵活匹配**: 允许属性名和节点名之间有符号分隔
4. 点击"应用设置"保存配置

#### 日志管理
- **显示所有日志**: 查看详细的操作过程
- **只显示错误**: 仅显示错误信息，减少干扰

## ⚙️ 配置文件

插件的用户数据保存在 `user-data.json` 文件中，包含：

```json
{
  "favorites": ["cc.Label", "cc.Button", "cc.Sprite"],
  "usage": {
    "cc.Label": 15,
    "cc.Button": 8,
    "cc.Sprite": 12
  },
  "settings": {
    "logLevel": "ERROR_ONLY",
    "autoPropertyMount": {
      "enabled": true,
      "ignoreCase": true,
      "flexibleMatching": true,
      "showMountLog": true
    }
  }
}
```

## 🔧 故障排除

### 常见问题

#### 1. 插件无法加载
**症状**: 菜单中找不到智能组件管理器选项
**解决方案**:
- 确认插件文件夹位于正确的 `packages` 目录
- 检查 `package.json` 文件格式是否正确
- 重启 Cocos Creator

#### 2. 搜索结果为空
**症状**: 输入组件名称但没有搜索结果
**解决方案**:
- 确认已选择场景中的节点
- 检查组件名称拼写是否正确
- 尝试使用部分匹配（如输入"Label"而不是"cc.Label"）

#### 3. 自动属性挂载不工作
**症状**: 添加组件后属性没有自动挂载
**解决方案**:
- 确认在设置中启用了"自动属性挂载"
- 检查节点名称是否与属性名称匹配
- 确认目标节点上有对应类型的组件
- 查看日志了解挂载失败的具体原因

#### 4. 当前组件列表不更新
**症状**: 删除组件后列表没有更新
**解决方案**:
- 点击刷新按钮(🔄)手动更新
- 这是已知限制，无法自动监听组件删除事件

### 性能优化建议

1. **大型场景**: 在包含大量节点的场景中，自动属性挂载可能较慢，建议：
   - 仅在需要时启用自动挂载
   - 使用更精确的节点命名规则

2. **搜索优化**: 使用更具体的搜索关键词以获得更精确的结果

## 🤝 贡献指南

### 开发环境

- **Cocos Creator**: 2.4.x 或更高版本
- **Node.js**: 建议使用 LTS 版本

### 代码结构

```
ccc-smart-component-manager/
├── main.js                 # 插件主入口
├── scene-accessor.js       # 场景操作接口
├── search-engine.js        # 搜索引擎
├── data-manager.js         # 数据管理
├── property-mounter.js     # 属性挂载器
├── logger.js              # 日志管理
├── i18n-helper.js         # 国际化助手
├── panel/
│   └── index.js           # UI面板
├── i18n/
│   └── zh.js              # 中文语言包
└── typings/
    └── editor.d.ts        # TypeScript 类型定义
```

### 提交规范

- 使用语义化提交信息
- 新功能: `feat: 添加新功能描述`
- 修复: `fix: 修复问题描述`
- 文档: `docs: 更新文档`

## 📄 许可证

本项目基于原作者 dogking18 的 add_component 插件进行二次开发，遵循开源协议。

## 🔄 版本信息

- **当前版本**: v1.2.1
- **基于**: add_component (dogking18)
- **开发者**: fenglimg
- **更新日志**: 详见 [CHANGELOG.md](./CHANGELOG.md)

## 📞 支持与反馈

如果您在使用过程中遇到问题或有改进建议，欢迎：

1. 查看 [CHANGELOG.md](./CHANGELOG.md) 了解最新功能和已知问题
2. 检查本文档的故障排除部分
3. 提交 Issue 或 Pull Request

---

> 💡 **提示**: 建议定期备份 `user-data.json` 文件以保存您的收藏和设置。
