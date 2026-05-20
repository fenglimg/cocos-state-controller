/**
 * 状态名枚举 (空骨架, 不要往里加值)。
 *
 * Cocos Creator 2.x 用 @property(EnumStateName) 把字段显示成枚举下拉。
 * 下拉的实际选项不在这里静态声明 — StateController 在运行时通过
 *   cc.Class.Attr.setClassAttr(this, "selectedIndex", "enumList", array)
 * 把当前实例的 states 列表注入到这个枚举的下拉项。
 */
export enum EnumStateName {
}

/** 更新选择器的类型 */
export enum EnumUpdateType {
    /** 名字 */
    Name = 1,
    /** 可选状态 */
    SelPage = 2,
    /** 状态 */
    State = 0,
    /** 删除控制器 */
    Delete = 4,
    /** 初始化 */
    Init = 3,
    /** 更新选中的属性 */
    Prop = 5,
    /** 状态顺序变更 */
    Move = 6,
    /** 状态复制 (copySelectedState 触发, 通知 StateSelect 深拷贝 pageData) */
    Copy = 7,
    /** 录制开始 (StateController.startRecording 触发, 通知 StateSelect 拍 snapshot) */
    RecordingStart = 8,
    /** 录制结束 (StateController.stopRecording 触发, 通知 StateSelect final commit + 清 snapshot) */
    RecordingStop = 9,
    /** 状态即将切换 (selectedIndex setter 触发, 录制中触发 diff commit) */
    StateWillChange = 10,
}
/**
 * 控制器名字枚举 (空骨架, 不要往里加值)。
 * 同 EnumStateName: 由 StateSelect 运行时把可见的控制器名字列表
 * 注入为 currCtrlId 字段的 inspector 下拉项。
 */
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
 * 3. 在StateSelect.ts中的setDefaultProp方法中添加对应的case
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
    /** 按钮交互 */
    ButtonInteractable = 16,

    /** 进度条(ProgressBar) 进度 */
    ProgressBarProgress = 17,
    /** Toggle 选中状态 */
    ToggleIsChecked = 18,
    /** RichText 文本内容 */
    RichTextString = 19,
    /** ScrollView 启用状态 */
    ScrollViewEnabled = 20,
    /** Mask 组件启用状态 */
    MaskEnabled = 21,

    /** Label 字体大小 */
    LabelFontSize = 22,
    /** Label 行高 */
    LabelLineHeight = 23,
    /** Label 字符间距 (spacingX) */
    LabelSpacingX = 24,
    /** Label 自动换行开关 */
    LabelWrapEnable = 25,
    /** Sprite 填充范围 (fillRange) */
    SpriteFillRange = 26,
    /** Widget 启用状态 */
    WidgetEnabled = 27,
    /** Widget 对齐刷新模式 */
    WidgetAlignMode = 28,
    /** Widget 顶部对齐开关 */
    WidgetIsAlignTop = 29,
    /** Widget 底部对齐开关 */
    WidgetIsAlignBottom = 30,
    /** Widget 左侧对齐开关 */
    WidgetIsAlignLeft = 31,
    /** Widget 右侧对齐开关 */
    WidgetIsAlignRight = 32,
    /** Widget 水平居中开关 */
    WidgetIsAlignHorizontalCenter = 33,
    /** Widget 垂直居中开关 */
    WidgetIsAlignVerticalCenter = 34,
    /** Widget 顶部边距 */
    WidgetTop = 35,
    /** Widget 底部边距 */
    WidgetBottom = 36,
    /** Widget 左侧边距 */
    WidgetLeft = 37,
    /** Widget 右侧边距 */
    WidgetRight = 38,
    /** Widget 水平居中偏移 */
    WidgetHorizontalCenter = 39,
    /** Widget 垂直居中偏移 */
    WidgetVerticalCenter = 40,

    // 🔧 注意：旋转四元数暂时不支持，因为编辑器操作复杂
    // /** 旋转、四元数*/
    // Rotation,
}
