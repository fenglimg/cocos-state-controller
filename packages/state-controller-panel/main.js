'use strict';

/**
 * State Controller Panel — Editor 入口 (Wave 3 scaffold).
 *
 * 负责响应主菜单 + Inspector "跳转 Panel" 按钮的 open/close 消息.
 * 实际面板 UI 在 panel/ 下 (Gemini 后续实装).
 */

module.exports = {
    load() {
        // 预留: 启动时初始化全局状态 (本期无)
    },

    unload() {
        // 预留: 关闭时清理 (本期无)
    },

    messages: {
        'open'() {
            Editor.Panel.open('state-controller-panel');
        },
        'close'() {
            Editor.Panel.close('state-controller-panel');
        },
    },
};
