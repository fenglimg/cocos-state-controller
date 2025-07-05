# 🔧 StateErrorManager 日志系统使用指南

## 📋 概述

StateErrorManager 提供了统一的日志管理系统，支持可配置的日志级别控制，让您可以根据需要调整日志输出的详细程度。

## 🎯 日志级别说明

### 📊 级别定义
```typescript
enum ErrorLevel {
    DEBUG = 0,    // 🔍 调试信息 - 详细的开发调试信息
    INFO = 1,     // ℹ️ 信息日志 - 一般的运行信息
    WARN = 2,     // ⚠️ 警告日志 - 需要注意的问题
    ERROR = 3,    // ❌ 错误日志 - 需要处理的错误
    FATAL = 4,    // 💥 致命错误 - 严重的系统错误
    SILENT = 5    // 🔇 静音模式 - 不输出任何日志
}
```

### 🎯 默认设置
```typescript
// 默认日志级别为 WARN，只输出警告及以上级别的日志
private static _logLevel: ErrorLevel = ErrorLevel.WARN;
```

## 🚀 基本使用方法

### 1. 设置日志级别
```typescript
// 设置为DEBUG级别，输出所有日志
StateErrorManager.setLogLevel(ErrorLevel.DEBUG);

// 设置为INFO级别，输出INFO及以上级别的日志
StateErrorManager.setLogLevel(ErrorLevel.INFO);

// 设置为WARN级别，只输出警告及以上级别的日志
StateErrorManager.setLogLevel(ErrorLevel.WARN);

// 设置为ERROR级别，只输出错误及以上级别的日志
StateErrorManager.setLogLevel(ErrorLevel.ERROR);

// 设置为SILENT级别，不输出任何日志
StateErrorManager.setLogLevel(ErrorLevel.SILENT);
```

### 2. 使用便捷方法输出日志
```typescript
// 调试信息
StateErrorManager.debug("这是调试信息", {
    component: 'MyComponent',
    method: 'myMethod',
    params: { value: 123 }
});

// 一般信息
StateErrorManager.info("操作完成", {
    component: 'StateController',
    method: 'updateState'
});

// 警告信息
StateErrorManager.warn("检测到潜在问题", {
    component: 'StateSelect',
    method: 'propKey.setter',
    params: { propType: 'Invalid' }
});

// 错误信息
StateErrorManager.error("操作失败", {
    component: 'StateController',
    method: 'states.setter',
    params: { error: 'Invalid state data' }
});

// 致命错误
StateErrorManager.fatal("系统崩溃", {
    component: 'StateController',
    method: 'criticalOperation',
    params: { error: 'System failure' }
});
```

## 🎨 实际应用场景

### 场景1：开发调试阶段
```typescript
// 开发时显示所有日志，方便调试
StateErrorManager.setLogLevel(ErrorLevel.DEBUG);

// 在组件中添加调试信息
StateErrorManager.debug("状态切换开始", {
    component: 'StateController',
    method: 'selectedIndex.setter',
    params: { fromState: 0, toState: 1 }
});
```

### 场景2：测试阶段
```typescript
// 测试时显示信息级别以上的日志
StateErrorManager.setLogLevel(ErrorLevel.INFO);

// 记录重要操作
StateErrorManager.info("控制器初始化完成", {
    component: 'StateController',
    method: '__preload',
    params: { stateCount: 3 }
});
```

### 场景3：生产环境
```typescript
// 生产环境只显示警告及以上级别的日志
StateErrorManager.setLogLevel(ErrorLevel.WARN);

// 或者完全静音
StateErrorManager.setLogLevel(ErrorLevel.SILENT);
```

## 🔧 高级用法

### 1. 动态调整日志级别
```typescript
// 根据编辑器环境动态设置
if (CC_EDITOR) {
    StateErrorManager.setLogLevel(ErrorLevel.DEBUG);
} else {
    StateErrorManager.setLogLevel(ErrorLevel.WARN);
}
```

### 2. 条件日志输出
```typescript
// 只在特定条件下输出详细日志
if (someCondition) {
    StateErrorManager.setLogLevel(ErrorLevel.DEBUG);
    StateErrorManager.debug("进入详细调试模式");
} else {
    StateErrorManager.setLogLevel(ErrorLevel.INFO);
}
```

### 3. 临时调试
```typescript
// 临时降低日志级别进行调试
let originalLevel = StateErrorManager.getLogLevel();
StateErrorManager.setLogLevel(ErrorLevel.DEBUG);

// 执行需要调试的代码
doSomethingThatNeedsDebugging();

// 恢复原始日志级别
StateErrorManager.setLogLevel(originalLevel);
```

## 📊 日志输出格式

### 输出格式说明
```
[StateController][级别] 消息内容 | Context: {"component":"组件名","method":"方法名","params":{"参数":"值"}}
```

### 示例输出
```
[StateController][DEBUG] 🔍 使用默认状态名字 | Context: {"component":"StateController","method":"getSmartStateName","params":{"index":0,"defaultName":"1"}}

[StateController][INFO] 属性检查器已刷新 | Context: {"component":"StateController","method":"forceRefreshInspector"}

[StateController][WARN] states必须是有效的数组 | Context: {"component":"StateController","method":"states.setter","params":{"valueType":"undefined","isArray":false}}

[StateController][ERROR] 非编辑器环境，不更新名称 | Context: {"component":"StateController","method":"ctrlName.setter"}

[StateController][FATAL] 💥 FATAL: 系统崩溃 | Context: {"component":"StateController","method":"criticalOperation","params":{"error":"System failure"}}
```

## 🎯 最佳实践

### 1. 日志级别选择建议
- **DEBUG**: 开发阶段，需要详细调试信息时使用
- **INFO**: 记录重要的业务逻辑和状态变化
- **WARN**: 记录潜在问题，但不影响正常运行
- **ERROR**: 记录错误，但系统可以继续运行
- **FATAL**: 记录致命错误，系统无法继续运行

### 2. 上下文信息建议
```typescript
// 好的做法：提供详细的上下文信息
StateErrorManager.error("属性设置失败", {
    component: 'StateSelect',
    method: 'propKey.setter',
    params: { 
        propType: EnumPropName[value], 
        controllerId: this.currCtrlId,
        nodeId: this.node.uuid 
    }
});

// 不好的做法：缺少上下文信息
StateErrorManager.error("错误");
```

### 3. 性能考虑
```typescript
// 对于高频调用的方法，考虑使用DEBUG级别
StateErrorManager.debug("频繁调用的方法", context);

// 对于关键错误，使用ERROR或FATAL级别
StateErrorManager.error("关键错误", context);
```

## 🚀 与现有系统的集成

### 在您的代码中使用
```typescript
import { StateErrorManager, ErrorLevel } from './StateErrorManager';

// 在组件初始化时设置日志级别
onLoad() {
    // 根据需要设置日志级别
    StateErrorManager.setLogLevel(ErrorLevel.INFO);
    
    // 记录组件加载
    StateErrorManager.info("组件加载完成", {
        component: 'MyComponent',
        method: 'onLoad'
    });
}
```

## 🎯 总结

StateErrorManager 的日志系统提供了：
- ✅ **可配置的日志级别** - 根据需要调整输出详细程度
- ✅ **统一的日志格式** - 便于搜索和分析
- ✅ **丰富的上下文信息** - 快速定位问题
- ✅ **便捷的使用方式** - 简单易用的API
- ✅ **性能优化** - 不输出的日志不会影响性能

通过合理使用日志级别控制，您可以在开发、测试和生产环境中获得最适合的日志输出，提高开发效率和问题排查能力。 