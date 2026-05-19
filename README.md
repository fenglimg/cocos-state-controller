# 🎮 Cocos Creator UI状态控制器系统

问题记录：
1. 主控制器设置状态数量有问题，无法创建新状态。

> 💡 灵感来源  
> 为了实现类似FairyGUI中控制器的效果，参考了【开源分享】一个基于Fgui状态控制器（controller）的creator3.0x版本，并将3.x版本改进为2.x版本，同时加入了诸多新特性。

## 📋 文档目录

- [🎯 项目概述](#-项目概述)
- [✨ 核心特性](#-核心特性)
- [🚀 快速开始](#-快速开始)
- [📖 详细使用指南](#-详细使用指南)
- [🔧 版本更新说明](#-版本更新说明)
- [📚 API文档](#-api文档)
- [🔬 高级功能](#-高级功能)
- [🛠️ 故障排除](#️-故障排除)
- [🏗️ 系统架构](#️-系统架构)

---

## 🎯 项目概述

### 🎨 适用场景
| 场景类型 | 应用示例 | 效果展示 |
|---------|---------|---------|
| 按钮状态 | 普通/悬浮/按下/禁用 | 颜色、图片、缩放变化 |
| 面板动画 | 展开/收起/淡入/淡出 | 位置、大小、透明度变化 |
| 角色状态 | 健康/受伤/死亡/技能 | 血条、图标、文本变化 |
| 界面布局 | 横屏/竖屏/全屏/窗口 | 位置、锚点、大小变化 |
## 🚀 快速开始

### 📁 第一步：导入文件

将文件夹复制到项目中：

assets/script/controller/
├── 📄 StateController.ts      # 状态控制器核心
├── 📄 StateSelect.ts         # 状态选择器
├── 📄 StateEnum.ts          # 枚举定义
├── 📄 StateErrorManager.ts  # 错误处理系统
└── 📄 StatePropHandler.ts   # 属性处理器系统

### 🎮 第二步：添加控制器

> 📌 重要提示  
> StateController 应该添加到**父节点**上，它会自动管理所有子节点的状态。

1. 在需要状态控制的父节点上添加 `StateController` 组件
2. 在属性面板中设置状态数量和名称
3. 系统会自动创建默认状态："0" 和 "1"

### 🎨 第三步：配置状态选择器

1. 在需要状态变化的**子节点**上添加 `StateSelect` 组件
2. 选择要控制的属性类型（Position、Color、Scale等）
3. 在不同状态下设置不同的属性值
4. 选择合适的同步模式

### ✅ 第四步：测试效果

在编辑器中切换 `StateController` 的 `selectedIndex`，观察子节点属性的变化。

---

## 📖 详细使用指南

### 🎮 StateController（状态控制器）

> 🔧 核心组件  
> 负责管理整个状态组，是系统的控制中心。

#### 基本属性
| 属性名 | 类型 | 说明 | 示例值 |
|--------|------|------|--------|
| `ctrlName` | string | 控制器名称（必须唯一） | "MainMenuCtrl" |
| `selectedIndex` | number | 当前选中的状态索引 | 0, 1, 2... |
| `states` | StateValue[] | 状态列表，可动态添加删除 | ["normal", "hover", "pressed"] |
| `previousIndex` | number | 上一个状态索引（只读） | 0 |


#### 代码控制示例
// 🎯 获取控制器组件
let controller = node.getComponent(StateController);

// 🔄 切换到指定状态
controller.selectedIndex = 1;

// 📝 通过状态名称切换
controller.selectedPage = "hover";

// 📊 获取当前状态信息
let currentState = controller.selectedPage;
let previousState = controller.previousIndex;

### 🎨 StateSelect（状态选择器）

> 🎯 执行组件  
> 负责具体的状态变化，必须配合 StateController 使用。

#### 支持的属性类型

| 分类 | 属性类型 | 说明 | 值类型 |
|------|----------|------|--------|
| 节点基础 | `Active` | 显示/隐藏 | `boolean` |
| | `Position` | 位置坐标 | `cc.Vec3` |
| | `Euler` | 旋转角度 | `cc.Vec3` |
| | `Scale` | 缩放比例 | `number` |
| | `Anchor` | 锚点位置 | `cc.Vec2` |
| | `Size` | 尺寸大小 | `cc.Size` |
| | `Color` | 节点颜色 | `cc.Color` |
| | `Opacity` | 透明度 | `number` |
| 文本组件 | `Label_String` | 文本内容 | `string` |
| | `LabelOutline_Color` | 文本描边颜色 | `cc.Color` |
| | `Font` | 字体资源 | `cc.Font` |
| 图片组件 | `SpriteFrame` | 图片资源 | `cc.SpriteFrame` |
| 交互组件 | `Slider_Progress` | 滑动条进度 | `number` |
| | `Editbox_String` | 输入框文本 | `string` |
| 特效 | `GrayScale` | 灰度效果 | `boolean` |


#### 🔄 属性同步模式

enum SyncMode {
    Independent = 0,  // 🔸 独立模式：每个状态属性完全独立
    AutoSync = 1,     // 🔹 自动同步：添加/删除属性时自动同步到所有状态（推荐）
    ManualSync = 2    // 🔺 手动同步：需要手动点击同步按钮
}

> 💡 推荐设置  
> 对于大多数情况，建议使用 AutoSync 模式。

## 📚 API文档

### 🎮 StateController API

#### 核心属性

class StateController {
    // 🏷️ 控制器名称
    get ctrlName(): string;
    set ctrlName(value: string);
    
    // 🎯 当前选中状态索引
    get selectedIndex(): number;
    set selectedIndex(value: number);
    
    // 📋 状态数组
    get states(): StateValue[];
    
    // 📝 通过名称访问状态
    get selectedPage(): string;
    set selectedPage(name: string);
    
    // 📊 上一个状态索引（只读）
    get previousIndex(): number;
}

#### 生命周期方法

// 🔄 状态切换时自动调用，通知所有相关的StateSelect组件
private updateState(type: EnumUpdateType, value?: number): void;

### 🎨 StateSelect API

#### 核心属性

class StateSelect {
    // 🎮 当前选中的控制器ID
    get currCtrlId(): number;
    
    // 🎯 当前控制的属性类型
    get propKey(): EnumPropName;
    set propKey(value: EnumPropName);
    
    // 💎 当前属性值
    get propValue(): TPropValue;
    
    // 🔄 属性同步模式
    syncMode: SyncMode;
    
    // 📊 已修改的属性列表（只读）
    changedProp: string[];
}

#### 操作方法

// 🔄 手动同步当前属性到所有状态
set syncCurrentProp(value: boolean);

// 🗑️ 删除当前属性
set isDeleteCurr(value: boolean);

### 🛡️ 错误处理 API

class StateErrorManager {
    // 📝 统一日志输出
    static log(level: ErrorLevel, message: string, context?: IErrorContext): void;
    
    // 🛡️ 优雅降级处理
    static gracefulFallback<T>(operation: () => T, fallbackValue: T, errorMessage?: string): T;
    
    // ✅ 节点有效性验证
    static validateNode(node: cc.Node, context?: IErrorContext): boolean;
    
    // 💬 用户友好的错误提示
    static userFriendlyError(userMessage: string, technicalDetails?: string, context?: IErrorContext): void;
}

---

## 🔬 高级功能

### 🔧 自定义属性处理器

如果需要支持新的属性类型，可以按以下步骤扩展：

#### 1️⃣ 添加枚举值
在 `StateEnum.ts` 中添加新的属性类型：
export enum EnumPropName {
    // ... 现有属性
    Button_Interactable = 16,  // 🆕 新增：按钮可交互性
}

#### 2️⃣ 实现属性处理器
在 `StatePropHandler.ts` 中创建处理器类：
class ButtonInteractablePropHandler implements IPropHandler {
    getValue(node: cc.Node) {
        const button = node.getComponent(cc.Button);
        return button ? button.interactable : undefined;
    }
    
    setValue(node: cc.Node, value: TPropValue) {
        const button = node.getComponent(cc.Button);
        if (button) button.interactable = value as boolean;
    }
    
    getDefaultValue(node: cc.Node) {
        return this.getValue(node);
    }
}

#### 3️⃣ 注册处理器

PropHandlerManager.register(EnumPropName.Button_Interactable, new ButtonInteractablePropHandler());

### 🎯 实际应用示例

#### 📱 示例1：按钮状态控制

创建一个带有 normal、hover、pressed 三种状态的按钮：
ButtonNode (StateController)
├── 🖼️ Background (StateSelect - SpriteFrame + Color)
├── 🏷️ Label (StateSelect - Label_String + Color)
└── 🎨 Icon (StateSelect - Scale + Opacity)

🔧 配置步骤：

1. 在 `ButtonNode` 上添加 `StateController`，设置3个状态
2. 在 `Background` 上添加 `StateSelect`：
   - 属性类型选择 `SpriteFrame`，设置不同状态的背景图
   - 再添加一个选择 `Color`，设置不同的背景色调
3. 在 `Label` 上配置文本和颜色变化
4. 在 `Icon` 上配置缩放和透明度变化

#### 📋 示例2：面板展开/收起

创建一个可以展开收起的设置面板：

SettingsPanel (StateController)
├── 🎨 Background (StateSelect - Size + Opacity)
├── 🏷️ Title (StateSelect - Position)
├── 📝 Content (StateSelect - Active + Position)
└── ❌ CloseButton (StateSelect - Scale + Opacity)

#### 🎮 示例3：角色状态显示

显示角色的不同状态（健康、受伤、死亡）：

CharacterUI (StateController)
├── ❤️ HealthBar (StateSelect - Scale + Color)
├── 🛡️ StatusIcon (StateSelect - SpriteFrame)
├── 📛 NameLabel (StateSelect - Color + LabelOutline_Color)
└── 🔢 LevelText (StateSelect - Label_String)

暂时无法在飞书文档外展示此内容
