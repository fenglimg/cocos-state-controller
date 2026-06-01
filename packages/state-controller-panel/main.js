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

// M2a-3 硬化: 记住 inspector 增强是否开着, scene:ready (切/重载场景) 后自动重注入,
// 避免渲染进程重载丢失常驻脚本后标记不恢复 (注入侧 VER 机制保证幂等覆盖).
let _inspectorOn = false;

// M2a-2: 各特性开关 (master 总开关 + viz/dirty/exclude), Editor.Profile 持久化 → 重启编辑器记忆.
const FLAGS_PROFILE_URL = 'profile://local/state-controller-inspector.json';
const DEFAULT_FLAGS = { master: true, viz: true, dirty: true, exclude: true };
let _flagsProfile = null;
function getFlags() {
    if (!_flagsProfile) {
        try { _flagsProfile = Editor.Profile.load(FLAGS_PROFILE_URL, { 'state-controller': DEFAULT_FLAGS }); }
        catch (e) { _flagsProfile = null; }
    }
    const data = (_flagsProfile && _flagsProfile.data && _flagsProfile.data['state-controller']) || DEFAULT_FLAGS;
    const f = {};
    for (const k in DEFAULT_FLAGS) f[k] = (typeof data[k] === 'boolean') ? data[k] : DEFAULT_FLAGS[k];
    return f;
}
function saveFlags(flags) {
    const f = {};
    for (const k in DEFAULT_FLAGS) f[k] = (flags && typeof flags[k] === 'boolean') ? flags[k] : DEFAULT_FLAGS[k];
    try {
        if (!_flagsProfile) _flagsProfile = Editor.Profile.load(FLAGS_PROFILE_URL, { 'state-controller': DEFAULT_FLAGS });
        _flagsProfile.data['state-controller'] = f;
        _flagsProfile.save();
    } catch (e) { /* 静默, Profile 不可用时仅本次会话内存生效 */ }
    return f;
}

module.exports = {
    load() {
        // 默认自动开启 (用户期望): 读持久化 flags, master 默认 true → 启动即注入, 无需手动点菜单.
        // 用户经面板 master toggle 持久化关闭 (saveFlags master:false) 后, 下次启动不自动注入.
        _inspectorOn = getFlags().master;
        if (_inspectorOn) {
            // 场景可能尚未 ready, 此次注入失败由 scene:ready 兜底 (其 _inspectorOn 已为 true).
            try { freshInject().enableInspectorMark(getFlags()); } catch (e) { /* 静默, scene:ready 重注入 */ }
        }
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
        // P1/P2a: 开/关 inspector 属性行状态机标记 (带持久化的特性 flags)
        'inspector-mark-on'() {
            _inspectorOn = true;
            freshInject().enableInspectorMark(getFlags());
        },
        'inspector-mark-off'() {
            _inspectorOn = false;
            freshInject().disableInspectorMark();
        },
        // M2a-3 硬化: 切/重载场景后, 若增强开着则重注入常驻脚本 (幂等, VER 覆盖旧脚本).
        'scene:ready'() {
            if (_inspectorOn) {
                try { freshInject().enableInspectorMark(getFlags()); } catch (e) { /* 静默 */ }
            }
        },
        // M2a-2: 面板读当前特性开关 (渲染 toggle 勾选态)
        'inspector-get-flags'(event) {
            const f = getFlags();
            if (event && event.reply) event.reply(null, f);
        },
        // M2a-2: 面板改特性开关 → 持久化 + 实时推给注入侧 (无需重注入). master 关也走 setFlags (注入侧清标记).
        'inspector-set-flags'(event, payload) {
            const f = saveFlags(payload);
            try { freshInject().setInspectorFlags(f); } catch (e) { /* 静默 */ }
            if (event && event.reply) event.reply(null, f);
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
