'use strict';

/**
 * State Controller Panel — Editor 入口 (Wave 3 scaffold).
 *
 * 负责响应主菜单 + Inspector "跳转 Panel" 按钮的 open/close 消息.
 * 实际面板 UI 在 panel/ 下 (Gemini 后续实装).
 */

// inspector 注入层 (P0 探针起步, 后续 P1–P3 注入/撤销也在此文件)
// 热重载: 每次取用都清 require 缓存重新 require, 这样改 inspector-inject.js 后
// 只需重点一次菜单 "开" 即生效, 无需重启编辑器 (配合注入脚本内的 VER 版本号覆盖旧常驻脚本).
function freshInject() {
    try { delete require.cache[require.resolve('./inspector-inject')]; } catch (e) {}
    return require('./inspector-inject');
}

module.exports = {
    load() {
        // 预留: 启动时初始化全局状态 (本期无)
    },

    unload() {
        // 边界 #5: 同步立即返回, 绝不等 IPC (照搬 hierarchy-plus 教训 —
        // 否则 Cocos Dashboard 检测不到进程退出会挂起).
        // 撤销注入: 让常驻脚本 disconnect observer + 移除标记. executeJavaScript 是
        // fire-and-forget (不 await), 同步派发不阻塞. 主要服务 "reload 扩展" 场景
        // (webContents 不随之销毁, 残留 observer 必须清); 关编辑器场景 webContents 随之销毁, 无害.
        try { freshInject().disableInspectorMark(); } catch (e) { /* 静默, 不阻塞退出 */ }
    },

    messages: {
        'open'() {
            Editor.Panel.open('state-controller-panel');
        },
        'close'() {
            Editor.Panel.close('state-controller-panel');
        },
        // P0: 探测 inspector DOM, 找 "属性行 → propRef" 桥
        'probe-inspector'() {
            freshInject().probeInspector();
        },
        // P1/P2a: 开/关 inspector 属性行状态机标记
        'inspector-mark-on'() {
            freshInject().enableInspectorMark();
        },
        'inspector-mark-off'() {
            freshInject().disableInspectorMark();
        },
        // P2a: 注入侧 (渲染进程) 请求"这些 propRef 的状态机身份" → 转给 scene-script 分类 → 回包
        'inspector-req-status'(event, payload) {
            try {
                Editor.Scene.callSceneScript('state-controller-panel', 'inspector-prop-status', payload, function (err, res) {
                    if (event && event.reply) event.reply(err, res);
                });
            } catch (e) {
                if (event && event.reply) event.reply(e.message, null);
            }
        },
        // M1-2: 注入侧请求"各受控 propRef 跨状态差异 + 各状态值表" → 转 scene-script → 回包 (标 ● + hover)
        'inspector-req-state-values'(event, payload) {
            try {
                Editor.Scene.callSceneScript('state-controller-panel', 'inspector-prop-state-values', payload, function (err, res) {
                    if (event && event.reply) event.reply(err, res);
                });
            } catch (e) {
                if (event && event.reply) event.reply(e.message, null);
            }
        },
        // P2b: 注入侧点击标记 → 切换排除 (转 scene-script 写数据 + undo + 标脏)
        'inspector-toggle-exclude'(event, payload) {
            try {
                Editor.Scene.callSceneScript('state-controller-panel', 'inspector-toggle-exclude', payload, function (err, res) {
                    if (event && event.reply) event.reply(err, res);
                });
            } catch (e) {
                if (event && event.reply) event.reply(e.message, null);
            }
        },
    },
};
