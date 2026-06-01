'use strict';

/**
 * state-controller-panel · inspector 注入层
 *
 * 当前阶段 = P0 探针: 注入编辑器渲染进程, 探测属性检查器 (inspector) 面板的真实 DOM,
 * 找出 "属性行 DOM → propRef (compName.propKey)" 这座桥. 桥确认后才铺 P1–P3.
 *
 * 设计约束 (照搬 hierarchy-plus 教训):
 *   - 走 require('electron').webContents.getAllWebContents() + executeJavaScript 注入
 *   - 注入脚本必须自包含 (字符串化后在渲染进程跑, 不能引用外部变量)
 *   - 主进程侧只做同步活, 不阻塞
 *
 * 本文件当前只导出 probeInspector(); P1–P3 的 inject/apply/clear/withdraw 后续追加在此.
 */

// ===== P0 探针: 在渲染进程执行的自包含脚本 =====
// 返回一个结构化对象: { found, inspectorPanel, panels, candidateCounts, samples, skeleton }
function buildProbeScript() {
    const fn = function () {
        const CAP_TRAVERSE = 8000;   // 深度遍历节点上限 (防卡)
        const CAP_SAMPLE = 18;       // 采样属性行数量

        // ---- 工具: 穿透 shadowRoot 按 id 找 ----
        function deepFindById(root, id) {
            if (!root) return null;
            try {
                const d = root.getElementById ? root.getElementById(id)
                    : (root.querySelector ? root.querySelector('#' + id) : null);
                if (d) return d;
            } catch (e) {}
            const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
            for (let i = 0; i < all.length; i++) {
                if (all[i].shadowRoot) {
                    const f = deepFindById(all[i].shadowRoot, id);
                    if (f) return f;
                }
            }
            return null;
        }

        // ---- 工具: 深度遍历 (穿透 shadowRoot), 收集所有元素 ----
        function deepCollect(root, out) {
            if (!root || out.length >= CAP_TRAVERSE) return;
            const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
            for (let i = 0; i < all.length; i++) {
                if (out.length >= CAP_TRAVERSE) return;
                const el = all[i];
                out.push(el);
                if (el.shadowRoot) deepCollect(el.shadowRoot, out);
            }
        }

        // ---- 工具: 元素简述 ----
        function brief(el) {
            if (!el || !el.tagName) return null;
            let cls = '';
            try { cls = (el.className && el.className.toString ? el.className.toString() : '').slice(0, 50); } catch (e) {}
            let text = '';
            try { text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28); } catch (e) {}
            return { tag: el.tagName.toLowerCase(), id: el.id || '', cls: cls, text: text };
        }

        // ---- 工具: dump 元素的关键属性 (找桥用) ----
        function dumpAttrs(el) {
            const out = {};
            try {
                const at = el.attributes || [];
                for (let i = 0; i < at.length; i++) {
                    const n = at[i].name;
                    // 只留可能是桥的属性, 跳过样式噪音
                    if (n === 'class' || n === 'style') continue;
                    out[n] = (at[i].value || '').slice(0, 80);
                }
            } catch (e) {}
            return out;
        }

        // ---- 工具: 浅 dump 一个对象的字段 (primitive + 一层引用名), 找真 propKey ----
        function dumpObjShallow(o, cap) {
            const out = {};
            if (!o || typeof o !== 'object') return out;
            let keys = [];
            try { keys = Object.keys(o); } catch (e) { return out; }
            out.__keys = keys.slice(0, cap || 30);
            for (let i = 0; i < keys.length && i < (cap || 30); i++) {
                const k = keys[i];
                try {
                    const val = o[k];
                    const t = typeof val;
                    if (val === null || t === 'string' || t === 'number' || t === 'boolean') {
                        out[k] = String(val).slice(0, 90);
                    } else if (t === 'object') {
                        // 标注引用类型 (找 cc.Component / path 节点)
                        let tag = '<obj>';
                        try { tag = '<' + (val.__classname__ || (val.constructor && val.constructor.name) || 'obj') + '>'; } catch (e) {}
                        out[k] = tag;
                    } else if (t === 'function') {
                        out[k] = '<fn>';
                    }
                } catch (e) {}
            }
            return out;
        }

        // ---- 工具: 探测元素上挂的框架数据 (Vue / Polymer) ----
        function dumpFrameworkData(el) {
            const out = {};
            try {
                if (el.__vue__) {
                    out.hasVue = true;
                    const v = el.__vue__;
                    out.vueKeys = Object.keys(v).filter(function (k) { return k[0] !== '_' || k === '_props'; }).slice(0, 25);
                    ['path', 'value', 'name', 'compName', 'type', 'attrs'].forEach(function (k) {
                        try {
                            if (v[k] !== undefined && (typeof v[k] !== 'object' || v[k] === null)) out['vue.' + k] = String(v[k]).slice(0, 80);
                        } catch (e) {}
                    });
                    // 深挖 target: 真 propKey / path / 组件引用可能在此
                    try {
                        if (v.target && typeof v.target === 'object') {
                            out['vue.target'] = dumpObjShallow(v.target, 30);
                        }
                    } catch (e) {}
                    // 深挖 _props (Vue prop bindings)
                    try {
                        if (v._props && typeof v._props === 'object') {
                            out['vue._props'] = dumpObjShallow(v._props, 30);
                        }
                    } catch (e) {}
                    // 有些版本把 attrs/path 放在 $attrs / $options.propsData
                    try {
                        if (v.$attrs) out['vue.$attrs'] = dumpObjShallow(v.$attrs, 20);
                    } catch (e) {}
                }
            } catch (e) {}
            // Polymer 风格的属性
            ['path', '_propPath', '_path', '_value', 'name', '_name'].forEach(function (k) {
                try {
                    if (el[k] !== undefined && (typeof el[k] !== 'object' || el[k] === null)) out['prop.' + k] = String(el[k]).slice(0, 80);
                } catch (e) {}
            });
            return out;
        }

        // ---- 工具: 向上爬祖先链 (穿透 shadow 边界), 找 component 分组/名字 ----
        function climb(el, levels) {
            const chain = [];
            let cur = el;
            for (let i = 0; i < levels && cur; i++) {
                let p = cur.parentElement;
                if (!p) {
                    const root = cur.getRootNode && cur.getRootNode();
                    p = (root && root.host) ? root.host : null;
                }
                if (!p) break;
                const b = brief(p);
                // 顺带把祖先的 path/comp 类属性也带上 (component header 常在此)
                const fw = dumpFrameworkData(p);
                if (Object.keys(fw).length) b.fw = fw;
                chain.push(b);
                cur = p;
            }
            return chain;
        }

        // ====== 主流程 ======
        // 1) 定位 inspector 面板: 先试常见 id, 再枚举所有面板兜底
        const tryIds = ['inspector', 'node', 'cc-inspector'];
        let inspectorPanel = null;
        for (let i = 0; i < tryIds.length; i++) {
            const p = deepFindById(document, tryIds[i]);
            if (p && p.shadowRoot) { inspectorPanel = p; break; }
        }

        // 枚举所有带 shadowRoot 的 *panel* frame (报 id/pkg, 帮我们认面板)
        const panels = [];
        (function () {
            const all = [];
            deepCollect(document, all);
            for (let i = 0; i < all.length; i++) {
                const el = all[i];
                if (!el.shadowRoot) continue;
                const tag = el.tagName.toLowerCase();
                if (tag.indexOf('panel') >= 0 || tag.indexOf('dock') >= 0 || el.id) {
                    let pkg = '';
                    try { pkg = el.getAttribute('package') || el.getAttribute('name') || el.getAttribute('panel-id') || ''; } catch (e) {}
                    if (tag.indexOf('panel') >= 0 || pkg || el.id) {
                        panels.push({ tag: tag, id: el.id || '', pkg: pkg });
                    }
                }
            }
        })();

        // 兜底: 若没找到 inspector, 从 panels 里挑 id/pkg 含 inspector 的
        if (!inspectorPanel) {
            const all = [];
            deepCollect(document, all);
            for (let i = 0; i < all.length; i++) {
                const el = all[i];
                if (!el.shadowRoot) continue;
                const hay = ((el.id || '') + ' ' + (el.getAttribute && (el.getAttribute('package') || '') || '')).toLowerCase();
                if (hay.indexOf('inspector') >= 0) { inspectorPanel = el; break; }
            }
        }

        if (!inspectorPanel || !inspectorPanel.shadowRoot) {
            return { found: false, reason: 'no inspector panel', panels: panels };
        }

        // 2) 在 inspector shadowRoot 内深度收集所有元素
        const elems = [];
        deepCollect(inspectorPanel.shadowRoot, elems);

        // 3) 按 4 种策略找 "属性行" 候选, 报命中数
        const byTag = [];        // <ui-prop>
        const byPathAttr = [];   // 带 path 属性
        const byVue = [];        // 挂 __vue__ 且含 path/value
        const byClass = [];      // class 含 prop
        for (let i = 0; i < elems.length; i++) {
            const el = elems[i];
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            if (tag === 'ui-prop' || tag === 'cc-prop' || tag.indexOf('-prop') >= 0) byTag.push(el);
            let hasPath = false;
            try { hasPath = el.hasAttribute && el.hasAttribute('path'); } catch (e) {}
            if (hasPath) byPathAttr.push(el);
            if (el.__vue__) {
                try {
                    const v = el.__vue__;
                    if (v.path !== undefined || v.value !== undefined || v.attrs !== undefined) byVue.push(el);
                } catch (e) {}
            }
            let cls = '';
            try { cls = (el.className && el.className.toString) ? el.className.toString().toLowerCase() : ''; } catch (e) {}
            if (cls.indexOf('prop') >= 0) byClass.push(el);
        }

        const candidateCounts = {
            totalElemsInInspector: elems.length,
            byTag_uiProp: byTag.length,
            byPathAttr: byPathAttr.length,
            byVuePathOrValue: byVue.length,
            byClassProp: byClass.length,
        };

        // 4) 选命中最多的策略采样 (优先 ui-prop, 再 pathAttr, 再 vue, 再 class)
        let pick = byTag.length ? byTag : (byPathAttr.length ? byPathAttr : (byVue.length ? byVue : byClass));
        const samples = [];
        for (let i = 0; i < pick.length && samples.length < CAP_SAMPLE; i++) {
            const el = pick[i];
            samples.push({
                self: brief(el),
                attrs: dumpAttrs(el),
                fw: dumpFrameworkData(el),
                ancestors: climb(el, 6),
            });
        }

        // 5) inspector 顶层骨架 (前几层, 帮我们看 component 分组结构)
        const skeleton = [];
        (function () {
            const top = inspectorPanel.shadowRoot.children || [];
            function walk(el, depth) {
                if (depth > 4 || skeleton.length > 120) return;
                const b = brief(el);
                b.depth = depth;
                const fw = dumpFrameworkData(el);
                if (Object.keys(fw).length) b.fw = fw;
                skeleton.push(b);
                const kids = el.children || [];
                for (let i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
                if (el.shadowRoot) {
                    const sk = el.shadowRoot.children || [];
                    for (let i = 0; i < sk.length; i++) walk(sk[i], depth + 1);
                }
            }
            for (let i = 0; i < top.length; i++) walk(top[i], 0);
        })();

        return {
            found: true,
            inspectorPanel: brief(inspectorPanel),
            panels: panels,
            candidateCounts: candidateCounts,
            pickedStrategy: byTag.length ? 'ui-prop tag' : (byPathAttr.length ? 'path attr' : (byVue.length ? 'vue path/value' : 'class prop')),
            samples: samples,
            skeleton: skeleton,
        };
    };
    return '(' + fn.toString() + ')()';
}

/**
 * P0: 在所有 webContents 跑探针, 把命中 inspector 的那个结果写成 JSON 文件 + 控制台摘要.
 * 操作前提: 编辑器里先选中一个挂了组件的节点 (inspector 才有内容可探).
 */
function probeInspector() {
    const script = buildProbeScript();
    let wrote = false;
    try {
        const all = require('electron').webContents.getAllWebContents();
        if (!all || !all.length) {
            Editor.warn('[sc-inspector-probe] 拿不到 webContents');
            return;
        }
        all.forEach(function (wc) {
            try {
                wc.executeJavaScript(script).then(function (r) {
                    if (!r) return;
                    if (!r.found) {
                        // 只在没有任何 wc 写成功时, 留个失败线索
                        return;
                    }
                    if (wrote) return;
                    wrote = true;
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        const out = path.join(__dirname, 'inspector-probe.json');
                        fs.writeFileSync(out, JSON.stringify(r, null, 2), 'utf8');
                        Editor.log('[sc-inspector-probe] ✅ DOM 探测完成 → ' + out
                            + '\n  inspector 面板: <' + (r.inspectorPanel && r.inspectorPanel.tag) + '> #' + (r.inspectorPanel && r.inspectorPanel.id)
                            + '\n  命中策略: ' + r.pickedStrategy
                            + '\n  候选计数: ' + JSON.stringify(r.candidateCounts)
                            + '\n  把这个 json 发我即可确认 "行↔propRef" 桥');
                    } catch (e) {
                        Editor.warn('[sc-inspector-probe] 写文件失败: ' + e.message
                            + '\n--- 直接 dump (截断) ---\n' + JSON.stringify(r).slice(0, 4000));
                    }
                }).catch(function () {});
            } catch (e) {}
        });
        // 兜底提示: 1.2s 后若没写成功, 多半是没选中节点
        setTimeout(function () {
            if (!wrote) {
                Editor.warn('[sc-inspector-probe] 未探到 inspector 内容 — 请先在场景里【选中一个挂了组件的节点】(最好带 StateSelect + cc.Sprite 等), 再跑一次探针');
            }
        }, 1200);
    } catch (e) {
        Editor.warn('[sc-inspector-probe] 注入失败: ' + e.message);
    }
}

// ===== P1/P2a: 常驻注入脚本 — 给属性行按"状态机身份"贴标记 =====
// 版本号机制 (照搬 hierarchy-plus): 改注入逻辑时 VER+1, reload 扩展即覆盖旧常驻脚本, 免重启编辑器.
// P2a: 不再无脑贴 ◆; 注入侧解析每行 propRef → 发主进程 → 场景按 tracked/excluded 分类回传 → 按身份着色.
function buildResidentScript() {
    const fn = function () {
        const VER = 10;
        const old = window.__SCI;
        if (old && old.version === VER) { old.apply(); return 'same-version'; }
        if (old && old.observer) { try { old.observer.disconnect(); } catch (e) {} }
        const SCI = window.__SCI = old || {};
        SCI.version = VER;
        SCI.observer = null;
        SCI.enabled = true;
        SCI.data = SCI.data || null;   // { uuid, map: { 'scope|display': {kind, refs} } }  (P2b 排除)
        SCI.dataSV = SCI.dataSV || null; // { uuid, map: {'scope|display': {varies, refs}}, props, states } (M1 状态行为可视化)
        SCI.reqUuid = null;            // 最近请求的 uuid
        SCI.lastReq = 0;               // 上次请求时间戳 (节流刷新, 应对数据源变动 #3)

        SCI.deepFindById = function (root, id) {
            if (!root) return null;
            try {
                const d = root.getElementById ? root.getElementById(id)
                    : (root.querySelector ? root.querySelector('#' + id) : null);
                if (d) return d;
            } catch (e) {}
            const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
            for (let i = 0; i < all.length; i++) {
                if (all[i].shadowRoot) {
                    const f = SCI.deepFindById(all[i].shadowRoot, id);
                    if (f) return f;
                }
            }
            return null;
        };

        SCI.getPanel = function () {
            const p = SCI.deepFindById(document, 'inspector');
            return (p && p.shadowRoot) ? p : null;
        };

        // 当前选中节点 uuid (渲染进程可直接读 Editor.Selection)
        SCI.getSelUuid = function () {
            try {
                const sel = Editor.Selection.curSelection('node');
                return (sel && sel.length) ? sel[0] : null;
            } catch (e) { return null; }
        };

        // M2a-3 硬化: 选中节点数 (多选时不渲染标记, 避免只对第一个打标的误导 + 不报错)
        SCI.getSelCount = function () {
            try {
                const sel = Editor.Selection.curSelection('node');
                return (sel && sel.length) ? sel.length : 0;
            } catch (e) { return 0; }
        };

        // 行的显示名 (Polymer = _name, Vue = __vue__.name)
        SCI.rowDisplay = function (uiProp) {
            try { return uiProp._name || (uiProp.__vue__ && uiProp.__vue__.name) || ''; } catch (e) { return ''; }
        };

        // 从一个 ui-prop 的 __vue__.target.path 抽组件序号 (__comps__.<idx>.<key>); 抽不出返回 -1.
        // (inspector target.uuid 是 dump 包装对象不可用, 序号才是可靠桥)
        SCI.compIndexOfRow = function (uiProp) {
            try {
                const v = uiProp.__vue__;
                if (v && v.target && typeof v.target.path === 'string') {
                    const m = v.target.path.match(/__comps__\.(\d+)\./);
                    if (m) return parseInt(m[1], 10);
                }
            } catch (e) {}
            return -1;
        };

        // 最近的 ui-section 元素 (穿透 shadow 向上)
        SCI.sectionOf = function (el) {
            let cur = el;
            for (let i = 0; i < 14 && cur; i++) {
                let p = cur.parentElement;
                if (!p) { const r = cur.getRootNode && cur.getRootNode(); p = (r && r.host) ? r.host : null; }
                if (!p) break;
                if (p.tagName && p.tagName.toLowerCase() === 'ui-section') return p;
                cur = p;
            }
            return null;
        };

        // 节流请求: uuid 变 或 距上次 > 600ms 才请求 (数据源变动靠 MutationObserver 触发 apply + 此节流刷新)
        SCI.maybeRequest = function (uuid) {
            const now = Date.now();
            if (uuid !== SCI.reqUuid || (now - SCI.lastReq) > 600) {
                SCI.reqUuid = uuid;
                SCI.lastReq = now;
                SCI.request(uuid);
                SCI.requestSV(uuid);
            }
        };

        // M1-2: 请求"各受控 propRef 跨状态差异 + 各状态值表" → 建 'scope|display' 行查找表
        SCI.requestSV = function (uuid) {
            try {
                Editor.Ipc.sendToMain('state-controller-panel:inspector-req-state-values', { uuid: uuid },
                    function (err, res) {
                        const map = {};
                        let props = null, states = null, selectedIndex = -1;
                        if (!err && res && res.ok && res.hasSelect) {
                            props = res.props || {};
                            states = res.states || [];
                            selectedIndex = (typeof res.selectedIndex === 'number') ? res.selectedIndex : -1;
                            const rows = res.rows || [];
                            for (let i = 0; i < rows.length; i++) {
                                const it = rows[i];
                                map[it.scope + '|' + it.display] = { varies: !!it.variesAcrossStates, override: !!it.overriddenAtCurrent, dirty: !!it.dirty, refs: it.refs };
                            }
                        }
                        SCI.dataSV = { uuid: uuid, map: map, props: props, states: states, selectedIndex: selectedIndex };
                        SCI.apply();
                    });
            } catch (e) {}
        };

        // M1-2: 序列化值 → 简短可读字符串 (与 handlers.serializeStateValue 的 _t 标签对齐)
        SCI.fmtVal = function (v) {
            if (v === null || v === undefined) return '—';
            const t = typeof v;
            if (t === 'number') return (Math.round(v * 1000) / 1000) + '';
            if (t === 'boolean' || t === 'string') return v + '';
            if (t === 'object') {
                if (v._t === 'Color') return 'rgba(' + v.r + ',' + v.g + ',' + v.b + ',' + v.a + ')';
                if (v._t === 'Vec2') return '(' + v.x + ', ' + v.y + ')';
                if (v._t === 'Vec3') return '(' + v.x + ', ' + v.y + ', ' + v.z + ')';
                if (v._t === 'Size') return v.width + '×' + v.height;
                if (v._t === 'Quat') return '(' + v.x + ',' + v.y + ',' + v.z + ',' + v.w + ')';
                if (v._t === 'Asset') return '' + v.id;
            }
            return '?';
        };

        // 单一色: ● 受状态机驱动 (跨状态有差异). 用户反馈: 双色 (蓝/琥珀) 易误解 → 统一蓝点.
        SCI.SV_COLOR = '#5ab1ef';

        // M1-2/M1-3: 贴/更新 ● 状态行为徽标. 独立于 P2b 排除徽标.
        //   varies 或 override → 贴单色 ● (统一蓝); override (当前 state 值≠default) 额外加同色描边环 (非第二种颜色).
        //   悬浮值表走自定义浮层 (SCI.showTip), 不用原生 title (原生有 ~0.5-1s 系统延迟 + 样式丑).
        SCI.markStateBadge = function (row, svHit) {
            let badge = null;
            const kids = row.children;
            for (let k = 0; k < kids.length; k++) {
                if (kids[k].className === '__sci-sv-badge') { badge = kids[k]; break; }
            }
            const varies = !!(svHit && svHit.varies);
            const override = !!(svHit && svHit.override);
            if (varies || override) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = '__sci-sv-badge';
                    badge.textContent = '●';
                    row.insertBefore(badge, row.firstChild);
                }
                // 统一样式: 单色; override 加同色描边环 (box-shadow), 不引入第二种颜色
                badge.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;'
                    + 'min-width:14px;height:14px;margin-right:3px;font-size:10px;line-height:1;'
                    + 'flex:0 0 auto;pointer-events:auto;cursor:help;vertical-align:middle;box-sizing:border-box;'
                    + 'border-radius:50%;color:' + SCI.SV_COLOR + ';'
                    + (override ? 'box-shadow:0 0 0 2px rgba(90,177,239,0.45);' : '');
                // 浮层数据挂在 badge 上 (showTip 读), 不写 title
                badge.__sv = { refs: (svHit.refs || []), display: SCI.rowDisplay(row), override: override };
            } else if (badge) {
                if (SCI.tipFor === badge) SCI.hideTip();
                badge.parentNode.removeChild(badge);
            }
        };

        // ---- 自定义即时浮层 (替代慢的原生 title) ----
        SCI.ensureTip = function () {
            if (SCI.tip && SCI.tip.isConnected) return SCI.tip;
            const t = document.createElement('div');
            t.className = '__sci-sv-tip';
            t.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;'
                + 'background:#2b2b2b;color:#ddd;border:1px solid #444;border-radius:5px;'
                + 'padding:7px 9px;font-size:11px;line-height:1.5;font-family:Menlo,Consolas,monospace;'
                + 'box-shadow:0 4px 14px rgba(0,0,0,0.5);max-width:340px;white-space:nowrap;'
                + 'display:none;opacity:0;transition:opacity 0.08s;';
            document.body.appendChild(t);
            SCI.tip = t;
            return t;
        };

        // 把序列化值渲成 HTML (Color 带色块)
        SCI.fmtValHTML = function (v) {
            if (v && typeof v === 'object' && v._t === 'Color') {
                const c = 'rgba(' + v.r + ',' + v.g + ',' + v.b + ',' + (v.a / 255).toFixed(2) + ')';
                return '<span style="display:inline-block;width:9px;height:9px;border-radius:2px;border:1px solid #555;'
                    + 'vertical-align:middle;margin-right:4px;background:' + c + '"></span>'
                    + 'rgba(' + v.r + ',' + v.g + ',' + v.b + ',' + v.a + ')';
            }
            return String(SCI.fmtVal(v)).replace(/</g, '&lt;');
        };

        SCI.buildTipHTML = function (sv) {
            const props = (SCI.dataSV && SCI.dataSV.props) || null;
            const states = (SCI.dataSV && SCI.dataSV.states) || null;
            const selIdx = (SCI.dataSV && typeof SCI.dataSV.selectedIndex === 'number') ? SCI.dataSV.selectedIndex : -1;
            let html = '<div style="font-weight:600;color:#fff;margin-bottom:4px">' + (sv.display || '') + '</div>';
            if (!props || !states || !states.length) return html + '<div style="color:#888">无状态数据</div>';
            html += '<table style="border-collapse:collapse">';
            for (let s = 0; s < states.length; s++) {
                const idx = states[s].index;
                const isCur = idx === selIdx;
                const parts = [];
                for (let r = 0; r < sv.refs.length; r++) {
                    const p = props[sv.refs[r]];
                    if (!p) continue;
                    const val = SCI.fmtValHTML(p.valueByState ? p.valueByState[idx] : undefined);
                    parts.push(sv.refs.length > 1 ? (sv.refs[r].split('.').pop() + '=' + val) : val);
                }
                const nm = (states[s].name || ('S' + idx));
                html += '<tr>'
                    + '<td style="padding:1px 8px 1px 0;color:' + (isCur ? '#fff' : '#9aa') + ';font-weight:' + (isCur ? '600' : '400') + '">'
                    + (isCur ? '▸ ' : '') + nm + '</td>'
                    + '<td style="padding:1px 0;color:#cfe">' + (parts.join(', ') || '—') + '</td></tr>';
            }
            html += '</table>';
            if (sv.override) html += '<div style="margin-top:4px;color:#e5a13a">⚑ 当前状态已覆盖 default</div>';
            return html;
        };

        SCI.showTip = function (badge) {
            if (!badge || !badge.__sv) return;
            const t = SCI.ensureTip();
            SCI.tipFor = badge;
            t.innerHTML = SCI.buildTipHTML(badge.__sv);
            t.style.display = 'block';
            // 先显示再量尺寸, 定位在徽标右下, 越界则翻转
            const r = badge.getBoundingClientRect();
            const tw = t.offsetWidth, th = t.offsetHeight;
            let left = r.right + 6, top = r.top;
            if (left + tw > window.innerWidth - 8) left = Math.max(8, r.left - tw - 6);
            if (top + th > window.innerHeight - 8) top = Math.max(8, window.innerHeight - th - 8);
            t.style.left = left + 'px';
            t.style.top = top + 'px';
            t.style.opacity = '1';
        };

        SCI.hideTip = function () {
            SCI.tipFor = null;
            if (SCI.tip) { SCI.tip.style.opacity = '0'; SCI.tip.style.display = 'none'; }
        };

        // M2a-1: 录制态脏行标记 — 琥珀左条 (inset box-shadow), 区别于 ● 蓝点 / ∅ 排除.
        SCI.markDirtyRow = function (row, dirty) {
            const had = row.getAttribute('data-sci-dirty') === '1';
            if (dirty && !had) {
                row.style.boxShadow = 'inset 3px 0 0 #e5a13a';
                row.setAttribute('data-sci-dirty', '1');
            } else if (!dirty && had) {
                row.style.boxShadow = '';
                row.removeAttribute('data-sci-dirty');
            }
        };

        // 向主进程要"选中节点上非全受控的行" → 转 scene → 回 items, 建 'scope|display' 查找表
        SCI.request = function (uuid) {
            try {
                Editor.Ipc.sendToMain('state-controller-panel:inspector-req-status', { uuid: uuid },
                    function (err, res) {
                        const map = {};
                        if (!err && res && res.ok && res.items) {
                            for (let i = 0; i < res.items.length; i++) {
                                const it = res.items[i];
                                map[it.scope + '|' + it.display] = { kind: it.kind, refs: it.refs };
                            }
                        }
                        SCI.data = { uuid: uuid, map: map };
                        SCI.apply();
                    });
            } catch (e) {}
        };

        // 贴/更新标记 (kind: excluded|loose|mixed|null). 受控行 = null = 不打标 (语义反转)
        SCI.markRow = function (row, kind, refs) {
            let badge = null;
            const kids = row.children;
            for (let k = 0; k < kids.length; k++) {
                if (kids[k].className === '__sci-badge') { badge = kids[k]; break; }
            }
            const refStr = (refs && refs.length) ? refs.join(', ') : '';
            if (kind === 'excluded' || kind === 'loose' || kind === 'mixed') {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = '__sci-badge';
                    // 贴属性名左侧: 每种行都有左侧空间, 不被值框/编辑按钮/Vec 子输入抢位.
                    // 放大命中区 (padding+min-width) 让 hover/点击更好触发; cursor:help 暗示可悬停.
                    badge.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;'
                        + 'min-width:18px;height:18px;padding:0 4px;margin-right:3px;border-radius:3px;'
                        + 'font-size:13px;line-height:1;flex:0 0 auto;pointer-events:auto;cursor:pointer;'
                        + 'vertical-align:middle;box-sizing:border-box;';
                    row.insertBefore(badge, row.firstChild);
                }
                // 点击切换用: 记下这行的 propRef 列表 + 当前身份 (onClick 读取)
                badge.setAttribute('data-refs', (refs || []).join(','));
                badge.setAttribute('data-kind', kind);
                if (kind === 'excluded') {
                    badge.textContent = '∅'; badge.style.color = '#888'; badge.style.opacity = '0.9';
                    badge.title = '已排除 · 点击恢复跟踪 · ' + refStr; row.style.opacity = '0.5';
                } else if (kind === 'loose') {
                    badge.textContent = '!'; badge.style.color = '#e5c07b'; badge.style.opacity = '0.95';
                    badge.title = '未受控 (可能掉出控制) · 点击加入排除清单 · ' + refStr; row.style.opacity = '';
                } else {
                    badge.textContent = '◐'; badge.style.color = '#d8a657'; badge.style.opacity = '0.95';
                    badge.title = '部分子项未受控/排除 · 点击全部排除 · ' + refStr; row.style.opacity = '';
                }
            } else {
                if (badge) badge.parentNode.removeChild(badge);
                if (row.style.opacity) row.style.opacity = '';
            }
        };

        // 点击标记 → 切换排除. ∅(已排除)→恢复跟踪; !/◐(未受控/部分)→加入排除.
        SCI.onClick = function (e) {
            let el = e.target, badge = null;
            for (let i = 0; i < 6 && el; i++) {
                const cls = el.className && el.className.toString ? el.className.toString() : '';
                if (cls.indexOf('__sci-badge') >= 0) { badge = el; break; }
                el = el.parentElement;
            }
            if (!badge) return;
            e.stopPropagation();
            if (e.preventDefault) e.preventDefault();
            const refs = (badge.getAttribute('data-refs') || '').split(',').filter(Boolean);
            const kind = badge.getAttribute('data-kind');
            if (!refs.length) return;
            const action = (kind === 'excluded') ? 'unexclude' : 'exclude';
            const uuid = SCI.getSelUuid();
            if (!uuid) return;
            try {
                Editor.Ipc.sendToMain('state-controller-panel:inspector-toggle-exclude',
                    { uuid: uuid, refs: refs, action: action },
                    function () { SCI.reqUuid = null; SCI.lastReq = 0; SCI.apply(); }); // 强制重拉刷新
            } catch (err) {}
        };

        SCI.apply = function () {
            const panel = SCI.getPanel();
            if (!panel || !SCI.enabled) return;
            // M2a-3 硬化: 多选时清掉残留标记并跳过 (只对第一个节点打标会误导; 也避免报错)
            if (SCI.getSelCount() > 1) {
                SCI.hideTip();
                const old = panel.shadowRoot.querySelectorAll('.__sci-badge, .__sci-sv-badge');
                for (let i = 0; i < old.length; i++) old[i].remove();
                const rws = panel.shadowRoot.querySelectorAll('ui-prop');
                for (let j = 0; j < rws.length; j++) {
                    if (rws[j].style.opacity) rws[j].style.opacity = '';
                    if (rws[j].getAttribute('data-sci-dirty')) { rws[j].style.boxShadow = ''; rws[j].removeAttribute('data-sci-dirty'); }
                }
                SCI.connect();
                return;
            }
            if (SCI.observer) SCI.observer.disconnect();
            try {
                const uuid = SCI.getSelUuid();
                if (uuid) SCI.maybeRequest(uuid);
                const map = (SCI.data && SCI.data.uuid === uuid) ? SCI.data.map : null;
                const svMap = (SCI.dataSV && SCI.dataSV.uuid === uuid) ? SCI.dataSV.map : null;
                const lis = panel.shadowRoot.querySelectorAll('ui-prop');
                // 1) 先给每个 ui-section 定组件序号: 扫该段内任一带 path 的 ui-prop (Script/Blend/Materials 等)
                const secScope = new Map();   // sectionEl -> compIndex
                for (let i = 0; i < lis.length; i++) {
                    const ci = SCI.compIndexOfRow(lis[i]);
                    if (ci >= 0) {
                        const sec = SCI.sectionOf(lis[i]);
                        if (sec && !secScope.has(sec)) secScope.set(sec, ci);
                    }
                }
                // 2) 逐行打标: 组件行用段序号, 否则 'node' 段
                for (let i = 0; i < lis.length; i++) {
                    const row = lis[i];
                    let kind = null, refs = null, svHit = null;
                    const display = SCI.rowDisplay(row);
                    if (display && (map || svMap)) {
                        const sec = SCI.sectionOf(row);
                        const scope = (sec && secScope.has(sec)) ? secScope.get(sec) : 'node';
                        const key = scope + '|' + display;
                        if (map) { const hit = map[key]; if (hit) { kind = hit.kind; refs = hit.refs; } }
                        if (svMap) svHit = svMap[key] || null;
                    }
                    SCI.markRow(row, kind, refs);                          // P2b 排除徽标 (∅/!/◐)
                    SCI.markStateBadge(row, svHit);                        // M1-2/M1-3 ● 状态行为徽标
                    SCI.markDirtyRow(row, !!(svHit && svHit.dirty));       // M2a-1 录制脏行 琥珀左条
                }
            } finally {
                SCI.connect();
            }
        };

        SCI.connect = function () {
            const panel = SCI.getPanel();
            if (!panel) return;
            const sr = panel.shadowRoot;
            // 点击委托 (挂 shadowRoot, capture; 同一 sr 只绑一次, wrapper 动态调 onClick 以便版本热更)
            if (!sr.__sciClick) {
                sr.addEventListener('click', function (e) {
                    const f = window.__SCI && window.__SCI.onClick; if (f) f(e);
                }, true);
                sr.__sciClick = true;
            }
            // 即时浮层委托 (mouseover/mouseout 冒泡; 命中 sv-badge 立刻显/隐, 无原生 title 延迟)
            if (!sr.__sciHover) {
                sr.addEventListener('mouseover', function (e) {
                    const S = window.__SCI; if (!S) return;
                    let el = e.target, badge = null;
                    for (let i = 0; i < 5 && el; i++) {
                        if (el.className === '__sci-sv-badge') { badge = el; break; }
                        el = el.parentElement;
                    }
                    if (badge) S.showTip(badge);
                }, true);
                sr.addEventListener('mouseout', function (e) {
                    const S = window.__SCI; if (!S) return;
                    let el = e.target, badge = null;
                    for (let i = 0; i < 5 && el; i++) {
                        if (el.className === '__sci-sv-badge') { badge = el; break; }
                        el = el.parentElement;
                    }
                    if (badge && S.tipFor === badge) S.hideTip();
                }, true);
                sr.__sciHover = true;
            }
            if (!SCI.observer) {
                SCI.observer = new MutationObserver(function () {
                    if (SCI.raf) cancelAnimationFrame(SCI.raf);
                    SCI.raf = requestAnimationFrame(function () { SCI.apply(); });
                });
            }
            SCI.observer.observe(sr, {
                childList: true, subtree: true,
                attributes: true, attributeFilter: ['style', 'class'],
            });
        };

        SCI.clear = function () {
            SCI.enabled = false;
            if (SCI.observer) { try { SCI.observer.disconnect(); } catch (e) {} }
            SCI.hideTip();
            if (SCI.tip && SCI.tip.parentNode) { try { SCI.tip.parentNode.removeChild(SCI.tip); } catch (e) {} SCI.tip = null; }
            const panel = SCI.getPanel();
            if (panel) {
                const bs = panel.shadowRoot.querySelectorAll('.__sci-badge, .__sci-sv-badge');
                for (let i = 0; i < bs.length; i++) bs[i].remove();
                const rows = panel.shadowRoot.querySelectorAll('ui-prop');
                for (let j = 0; j < rows.length; j++) {
                    if (rows[j].style.opacity) rows[j].style.opacity = '';
                    if (rows[j].getAttribute('data-sci-dirty')) { rows[j].style.boxShadow = ''; rows[j].removeAttribute('data-sci-dirty'); }
                }
            }
            SCI.reqUuid = null;
            SCI.data = null;
            SCI.dataSV = null;
        };

        // 等 inspector 面板就绪 (可能晚于注入)
        let tries = 0;
        (function wait() {
            if (SCI.getPanel()) { SCI.enabled = true; SCI.connect(); SCI.apply(); return; }
            if (tries++ < 20) setTimeout(wait, 300);
        })();

        return 'inited';
    };
    return '(' + fn.toString() + ')()';
}

const RESIDENT_SCRIPT = buildResidentScript();

function forEachWCSimple(script) {
    try {
        const all = require('electron').webContents.getAllWebContents();
        if (!all) return;
        all.forEach(function (wc) {
            try { wc.executeJavaScript(script).catch(function () {}); } catch (e) {}
        });
    } catch (e) {}
}

/** P1/P2a: 开启 inspector 标记 (注入常驻脚本) */
function enableInspectorMark() {
    forEachWCSimple(RESIDENT_SCRIPT);
    Editor.log('[sc-inspector] Inspector 增强已开 (M1+P2b). 选中带 StateSelect 的节点:'
        + '\n  ● 蓝 = 受状态机驱动 (跨状态有差异); 带描边环 = 当前 state 已覆盖 default. hover 即时弹各状态值表;'
        + '\n  琥珀左条 = 录制中改过未提交 (脏);'
        + '\n  ∅ 灰 = 已排除(整行变暗); ! 黄 = 未受控(掉出控制); ◐ = 部分. 点徽标切换排除.');
}

/** P1: 关闭 inspector 徽标 (撤销注入). 同步, 不等 IPC. */
function disableInspectorMark() {
    forEachWCSimple('window.__SCI && window.__SCI.clear && window.__SCI.clear()');
    Editor.log('[sc-inspector] Inspector 增强已关 (徽标已撤)');
}

module.exports = {
    probeInspector: probeInspector,
    enableInspectorMark: enableInspectorMark,
    disableInspectorMark: disableInspectorMark,
};
