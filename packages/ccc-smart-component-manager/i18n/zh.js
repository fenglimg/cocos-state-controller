module.exports = {
  // 主菜单
  "MAIN_MENU": {
    "package": {
      "title": {
        "智能组件管理器": {
          "开启": "开启智能组件管理器",
          "关闭": "关闭智能组件管理器",
          "高级面板": "打开高级功能面板"
        }
      }
    }
  },

  // 主面板
  "PANEL": {
    "title": "智能组件管理器",
    "placeholder": "输入要添加的组件名",
    "no_selection": "请选择节点",
    "init_complete": "智能组件管理器：初始化完成，准备就绪 ✓",
    "task_complete": "智能组件管理器: 组件添加任务已完成 ✓",
    "delete_complete": "智能组件管理器: 组件删除任务已完成 ✓",
    "component_added": "智能组件管理器: 为节点 [{{nodeName}}] 添加组件 [{{componentName}}]"
  },

  // 高级面板
  "ADVANCED_PANEL": {
    "title": "🚀 智能组件管理器 - 高级功能",
    "refresh": "刷新",
    "tabs": {
      "favorites": "⭐ 收藏夹",
      "history": "📝 历史记录",
      "batch": "📦 批量操作",
      "stats": "📊 统计信息"
    },
    "favorites": {
      "title": "常用组件",
      "add_current": "添加当前组件到收藏",
      "clear_all": "清空收藏",
      "removed": "已从收藏夹移除: {{componentName}}",
      "cleared": "收藏夹已清空"
    },
    "history": {
      "title": "最近使用的组件",
      "clear_all": "清空历史",
      "cleared": "历史记录已清空"
    },
    "batch": {
      "title": "批量添加组件",
      "placeholder": "输入组件名称，每行一个：\nButton\nLabel\nSprite",
      "add": "批量添加",
      "clear": "清空",
      "no_input": "请输入要添加的组件名称",
      "no_selection": "请先选择节点",
      "no_valid_names": "没有有效的组件名称",
      "complete": "批量添加完成: 成功 {{success}}/{{total}} 个组件"
    },
    "stats": {
      "total_components": "可用组件总数",
      "favorites_count": "收藏组件数",
      "history_count": "历史记录数",
      "selected_nodes": "选中节点数"
    },
    "messages": {
      "select_nodes_first": "请先选择节点",
      "get_components_failed": "获取组件信息失败",
      "components_added_to_favorites": "已添加 {{count}} 个组件到收藏夹",
      "component_added": "已添加组件: {{componentName}}",
      "ready": "智能组件管理器 - 高级功能面板已就绪 🚀"
    }
  },

  // 搜索相关
  "SEARCH": {
    "match_types": {
      "exact": "完全匹配",
      "prefix": "前缀匹配",
      "contains": "包含匹配",
      "pinyin": "拼音匹配",
      "fuzzy": "模糊匹配"
    },
    "enhanced_results": "增强搜索结果"
  },

  // 设置页面
  "SETTINGS": {
    "theme_settings": "主题外观",
    "theme_vibrant_dark": "活力深色",
    "theme_warm_dark": "温暖深色",
    "theme_cyberpunk": "赛博朋克",
    "theme_forest": "森林绿",
    "theme_sunset": "日落橙",
    "theme_ocean": "海洋蓝",
    "favorites_management": "收藏管理",
    "statistics": "统计信息",
    "auto_property_mount": "自动属性挂载",
    "shortcut_settings": "快捷键设置",
    "log_settings": "日志设置",
    "confirmation_settings": "确认对话框设置",
    "clear_favorites": "清空收藏",
    "available_components": "可用组件",
    "favorite_components": "收藏组件",
    "total_usage": "总使用次数",
    "selected_nodes": "选中节点",
    "enable_auto_mount": "启用自动属性挂载",
    "ignore_case": "忽略大小写差异",
    "flexible_matching": "字母顺序匹配",
    "show_mount_log": "显示挂载日志",
    "apply_settings": "应用设置",
    "focus_search_shortcut": "聚焦搜索框快捷键:",
    "no_shortcut": "无快捷键",
    "custom": "自定义",
    "custom_shortcut": "自定义快捷键:",
    "custom_shortcut_placeholder": "例如: CmdOrCtrl+K",
    "custom_shortcut_hint": "支持格式: CmdOrCtrl+字母, Alt+字母, Shift+字母, F1-F12等",
    "apply_shortcut": "应用快捷键",
    "test_shortcut": "测试快捷键",
    "log_level": "日志级别:",
    "log_all": "显示所有日志",
    "log_error_only": "只显示错误",
    "apply": "应用",
    "delete_confirm": "已有组件右键删除时显示确认对话框",
    "favorite_confirm": "搜索组件右键收藏时显示提醒消息"
  },

  // 通用消息
  "COMMON": {
    "success": "成功",
    "failed": "失败",
    "loading": "加载中...",
    "confirm": "确认",
    "cancel": "取消",
    "delete": "删除",
    "add": "添加",
    "remove": "移除",
    "clear": "清空",
    "refresh": "刷新"
  }
};
