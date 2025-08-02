/** 状态名 */
export enum EnumStateName {
}

/** 更新选择器的类型 */
export enum EnumUpdataType {
    /** 名字 */
    name = 1,
    /** 可选状态 */
    selPage = 2,
    /** 状态 */
    state = 0,
    /** 删除控制器 */
    delete = 4,
    /** 初始化 */
    init = 3,
    /** 更新选中的属性 */
    prop = 5,
}
/** 控制器名字 */
export enum EnumCtrlName {
}
/**
 * 🔧 核心枚举：属性名 - 定义所有支持的UI属性类型
 *
 * 这是整个状态控制器系统的基础枚举：
 * 1. 每个枚举值对应一种UI属性类型
 * 2. 枚举值的顺序决定了编辑器中的显示顺序
 * 3. 添加新属性类型需要同步更新属性处理器
 * 4. Non=0 是特殊值，表示"不选择任何属性"
 *
 * 扩展方式：
 * 1. 在此枚举中添加新的属性类型
 * 2. 在StatePropHandler.ts中实现对应的处理器
 * 3. 在StateSelect.ts中的setDefaultPorp方法中添加对应的case
 */
export enum EnumPropName {
    /** 不选择 - 特殊值，表示未选择任何属性 */
    Non = 0,

    // 🔧 节点基础属性
    /** 显示隐藏 */
    Active = 1,
    /** 位置 */
    Position = 2,
    /** 旋转、欧拉角 */
    Euler = 6,
    /** 缩放 */
    Scale = 7,
    /** 锚点 */
    Anchor = 8,
    /** 宽高 */
    Size = 9,
    /** 颜色 */
    Color = 10,
    /** 透明度 */
    Opacity = 11,

    // 🔧 组件相关属性
    /** 文本 */
    LabelString = 3,
    /** 描边 */
    LabelOutlineColor = 4,
    /** 图片 */
    SpriteFrame = 5,
    /** 字体 */
    Font = 12,
    /** 滑动条 */
    SliderProgress = 13,
    /** 编辑框 */
    EditboxString = 14,
    /** 灰度 */
    GrayScale = 15,

    // 🔧 注意：旋转四元数暂时不支持，因为编辑器操作复杂
    // /** 旋转、四元数*/
    // Rotation,
}

/** 🔧 新增：属性检查器刷新策略 */
export enum InspectorRefreshMode {
    /** 自动刷新：延迟刷新，防抖处理 */
    AutoRefresh = 0,
    /** 手动刷新：用户点击按钮刷新 */
    ManualRefresh = 1,
}
