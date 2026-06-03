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
        const VER = 13;
        const old = window.__SCI;
        if (old && old.version === VER) { old.apply(); return 'same-version'; }
        if (old && old.observer) { try { old.observer.disconnect(); } catch (e) {} }
        if (old && old.heartbeat) { try { clearInterval(old.heartbeat); } catch (e) {} }
        const SCI = window.__SCI = old || {};
        SCI.version = VER;
        SCI.observer = null;
        SCI.enabled = true;
        SCI.data = SCI.data || null;
        SCI.dataSV = SCI.dataSV || null;
        SCI.reqUuid = null;
        SCI.lastReq = 0;

        const injectedFlags = (typeof window.__SCI_FLAGS === 'object' && window.__SCI_FLAGS) ? window.__SCI_FLAGS : null;
        SCI.flags = (old && old.flags) || injectedFlags || { master: true, viz: true, dirty: true, exclude: true };
        SCI.setFlags = function (f) {
            if (f && typeof f === 'object') {
                for (const k in f) SCI.flags[k] = !!f[k];
            }
            SCI.apply();
        };

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

        SCI.getSelUuid = function () {
            try {
                const sel = Editor.Selection.curSelection('node');
                return (sel && sel.length) ? sel[0] : null;
            } catch (e) { return null; }
        };

        SCI.getSelCount = function () {
            try {
                const sel = Editor.Selection.curSelection('node');
                return (sel && sel.length) ? sel.length : 0;
            } catch (e) { return 0; }
        };

        SCI.rowDisplay = function (uiProp) {
            try { return uiProp._name || (uiProp.__vue__ && uiProp.__vue__.name) || ''; } catch (e) { return ''; }
        };

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

        SCI.maybeRequest = function (uuid) {
            const now = Date.now();
            if (uuid !== SCI.reqUuid || (now - SCI.lastReq) > 600) {
                SCI.reqUuid = uuid;
                SCI.lastReq = now;
                SCI.request(uuid);
                SCI.requestSV(uuid);
            }
        };

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

        SCI.fmtValHTML = function (v) {
            if (v && typeof v === 'object' && v._t === 'Color') {
                const c = 'rgba(' + v.r + ',' + v.g + ',' + v.b + ',' + (v.a / 255).toFixed(2) + ')';
                return '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;border:1px solid #555;'
                    + 'vertical-align:middle;margin-right:4px;background:' + c + '"></span>'
                    + '<span style="vertical-align:middle">rgba(' + v.r + ',' + v.g + ',' + v.b + ',' + v.a + ')</span>';
            }
            return '<span style="vertical-align:middle">' + String(SCI.fmtVal(v)).replace(/</g, '&lt;') + '</span>';
        };

        SCI.ensureTip = function () {
            if (SCI.tip && SCI.tip.isConnected) return SCI.tip;
            const t = document.createElement('div');
            t.className = '__sci-sv-tip';
            t.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;'
                + 'background:#252525;border:1px solid #444;border-radius:6px;'
                + 'box-shadow:0 8px 24px rgba(0,0,0,0.6);font-family:Menlo,Monaco,"Courier New",monospace;'
                + 'font-size:12px;line-height:1.4;display:none;opacity:0;transition:opacity 0.1s ease-in-out;'
                + 'width:360px;flex-direction:column;overflow:hidden;';
            document.body.appendChild(t);
            SCI.tip = t;
            return t;
        };

        SCI.buildTipHTML = function (badgeData) {
            const isExcluded = badgeData.kind === 'excluded';
            const isLoose = badgeData.kind === 'loose';
            const isMixed = badgeData.kind === 'mixed';
            
            let badgeHTML = '';
            if (isExcluded) badgeHTML = '<span style="background:rgba(136,136,136,0.2);color:#aaa;border:1px solid rgba(136,136,136,0.4);padding:2px 6px;border-radius:4px;font-size:10px;margin-left:8px;">已排除</span>';
            else if (isLoose) badgeHTML = '<span style="background:rgba(224,86,86,0.2);color:#e05656;border:1px solid rgba(224,86,86,0.4);padding:2px 6px;border-radius:4px;font-size:10px;margin-left:8px;">未受控</span>';
            else if (isMixed) badgeHTML = '<span style="background:rgba(229,161,58,0.2);color:#e5a13a;border:1px solid rgba(229,161,58,0.4);padding:2px 6px;border-radius:4px;font-size:10px;margin-left:8px;">部分未受控</span>';
            else if (badgeData.override) badgeHTML = '<span style="background:rgba(229,161,58,0.2);color:#e5a13a;border:1px solid rgba(229,161,58,0.4);padding:2px 6px;border-radius:4px;font-size:10px;margin-left:8px;">已覆盖 Default</span>';
            else if (badgeData.varies) badgeHTML = '<span style="background:rgba(90,177,239,0.2);color:#5ab1ef;border:1px solid rgba(90,177,239,0.4);padding:2px 6px;border-radius:4px;font-size:10px;margin-left:8px;">状态驱动</span>';

            const display = badgeData.display || (badgeData.refs && badgeData.refs[0]) || 'Property';

            let html = '<div style="background:#333;padding:8px 12px;border-bottom:1px solid #444;display:flex;justify-content:space-between;align-items:center;">'
                     + '<div style="font-weight:bold;color:#fff;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + display + '</div>'
                     + '<div style="flex-shrink:0;">' + badgeHTML + '</div>'
                     + '</div>'
                     + '<div style="padding:8px 12px;max-height:300px;overflow-y:auto;display:block;">';

            if (!badgeData.refs || !badgeData.refs.length) {
                html += '<div style="color:#888;font-size:12px;">无状态数据</div></div>';
                return html;
            }

            const props = (SCI.dataSV && SCI.dataSV.props) || null;
            const states = (SCI.dataSV && SCI.dataSV.states) || null;
            const selIdx = (SCI.dataSV && typeof SCI.dataSV.selectedIndex === 'number') ? SCI.dataSV.selectedIndex : -1;

            if (!props || !states || !states.length) {
                html += '<div style="color:#888;font-size:12px;">无状态数据</div></div>';
                return html;
            }

            html += '<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;margin:0;padding:0;">';
            for (let s = 0; s < states.length; s++) {
                const idx = states[s].index;
                const isCur = idx === selIdx;
                const nm = states[s].name || ('S' + idx);
                
                let valHTML = '<div style="display:flex;flex-wrap:wrap;gap:4px 8px;">';
                let hasVal = false;
                for (let r = 0; r < badgeData.refs.length; r++) {
                    const p = props[badgeData.refs[r]];
                    if (!p) continue;
                    const rawVal = p.valueByState ? p.valueByState[idx] : undefined;
                    const vStr = SCI.fmtValHTML(rawVal);
                    const keyPrefix = badgeData.refs.length > 1 ? '<span style="color:#777;">' + badgeData.refs[r].split('.').pop() + '=</span>' : '';
                    valHTML += '<span style="display:inline-flex;align-items:center;line-height:1.4;">' + keyPrefix + vStr + '</span>';
                    hasVal = true;
                }
                if (!hasVal) valHTML += '<span style="color:#777;line-height:1.4;">—</span>';
                valHTML += '</div>';

                html += '<tr>'
                      + '<td style="width:120px;padding:6px 8px 6px 0;vertical-align:top;border-bottom:1px solid #333;">'
                      +   '<div style="display:flex;align-items:flex-start;">'
                      +     '<span style="width:14px;flex-shrink:0;color:#5ab1ef;font-weight:bold;line-height:1.4;">' + (isCur ? '▸' : '') + '</span>'
                      +     '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4;color:' + (isCur ? '#fff' : '#999') + ';font-weight:' + (isCur ? 'bold' : 'normal') + ';" title="' + nm.replace(/"/g, '&quot;') + '">' + nm + '</span>'
                      +   '</div>'
                      + '</td>'
                      + '<td style="padding:6px 0;vertical-align:top;color:#9cdcfe;border-bottom:1px solid #333;word-wrap:break-word;">'
                      +   valHTML
                      + '</td>'
                      + '</tr>';
            }
            html += '</table></div>';
            return html;
        };

        SCI.showTip = function (container) {
            if (!container || !container.__badgeData) return;
            const t = SCI.ensureTip();
            SCI.tipFor = container;
            t.innerHTML = SCI.buildTipHTML(container.__badgeData);
            t.style.display = 'flex';
            const r = container.getBoundingClientRect();
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
            if (SCI.tip) {
                SCI.tip.style.opacity = '0';
                setTimeout(function() {
                    if (!SCI.tipFor && SCI.tip) SCI.tip.style.display = 'none';
                }, 120);
            }
        };

        SCI.updateRowStatus = function(row, kind, refs, svHit, flags) {
            let container = null;
            const kids = row.children;
            for (let k = 0; k < kids.length; k++) {
                if (kids[k].className === '__sci-indicator') { container = kids[k]; break; }
            }

            const isExcluded = flags.exclude && kind === 'excluded';
            const isLoose = flags.exclude && kind === 'loose';
            const isMixed = flags.exclude && kind === 'mixed';
            
            const varies = flags.viz && svHit && svHit.varies;
            const override = flags.viz && svHit && svHit.override;
            const isDirty = flags.dirty && svHit && svHit.dirty;

            if (!isExcluded && !isLoose && !isMixed && !varies && !override && !isDirty) {
                if (container) {
                    if (SCI.tipFor === container) SCI.hideTip();
                    container.parentNode.removeChild(container);
                }
                row.style.opacity = '';
                row.removeAttribute('data-sci-dirty');
                return;
            }

            if (!container) {
                container = document.createElement('div');
                container.className = '__sci-indicator';
                container.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;'
                    + 'width:18px;align-self:stretch;position:relative;'
                    + 'flex:0 0 auto;cursor:pointer;user-select:none;'
                    + 'box-sizing:border-box;margin-right:2px;';
                row.insertBefore(container, row.firstChild);
            }

            container.setAttribute('data-refs', (refs || []).join(','));
            container.setAttribute('data-kind', kind || '');
            
            container.__badgeData = {
                kind: kind,
                refs: refs || (svHit && svHit.refs) || [],
                display: SCI.rowDisplay(row),
                varies: varies,
                override: override,
                dirty: isDirty
            };

            let svg = '';
            if (isExcluded) {
                svg = '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="6" fill="none" stroke="#888" stroke-width="1.5"/><line x1="4" y1="4" x2="12" y2="12" stroke="#888" stroke-width="1.5"/></svg>';
                row.style.opacity = '0.5';
            } else if (isLoose) {
                svg = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1 L15 13 H1 Z" fill="none" stroke="#e05656" stroke-width="1.5"/><line x1="8" y1="5" x2="8" y2="10" stroke="#e05656" stroke-width="1.5"/><circle cx="8" cy="12" r="0.8" fill="#e05656"/></svg>';
                row.style.opacity = '';
            } else if (isMixed) {
                svg = '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="6" fill="none" stroke="#e5a13a" stroke-width="1.5"/><path d="M8 2 A 6 6 0 0 1 8 14 Z" fill="#e5a13a"/></svg>';
                row.style.opacity = '';
            } else if (varies || override) {
                if (override) {
                    svg = '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="4" fill="#5ab1ef"/><circle cx="8" cy="8" r="6.5" fill="none" stroke="#e5a13a" stroke-width="1.5"/></svg>';
                } else {
                    svg = '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="4.5" fill="#5ab1ef"/></svg>';
                }
                row.style.opacity = '';
            } else {
                row.style.opacity = '';
            }

            container.innerHTML = svg;

            if (isDirty) {
                container.style.boxShadow = 'inset 3px 0 0 #e5a13a';
                row.setAttribute('data-sci-dirty', '1');
            } else {
                container.style.boxShadow = 'none';
                row.removeAttribute('data-sci-dirty');
            }
        };

        SCI.onClick = function (e) {
            let el = e.target, badge = null;
            for (let i = 0; i < 6 && el; i++) {
                if (el.className === '__sci-indicator') { badge = el; break; }
                el = el.parentElement;
            }
            if (!badge) return;
            e.stopPropagation();
            if (e.preventDefault) e.preventDefault();
            const refs = (badge.getAttribute('data-refs') || '').split(',').filter(Boolean);
            const kind = badge.getAttribute('data-kind');
            if (!refs.length || !kind || kind === 'null') return;
            const action = (kind === 'excluded') ? 'unexclude' : 'exclude';
            const uuid = SCI.getSelUuid();
            if (!uuid) return;
            try {
                Editor.Ipc.sendToMain('state-controller-panel:inspector-toggle-exclude',
                    { uuid: uuid, refs: refs, action: action },
                    function () { SCI.reqUuid = null; SCI.lastReq = 0; SCI.apply(); });
            } catch (err) {}
        };

        SCI.wipeMarks = function (panel) {
            SCI.hideTip();
            const old = panel.shadowRoot.querySelectorAll('.__sci-indicator');
            for (let i = 0; i < old.length; i++) old[i].remove();
            const rws = panel.shadowRoot.querySelectorAll('ui-prop');
            for (let j = 0; j < rws.length; j++) {
                if (rws[j].style.opacity) rws[j].style.opacity = '';
                if (rws[j].getAttribute('data-sci-dirty')) { rws[j].style.boxShadow = ''; rws[j].removeAttribute('data-sci-dirty'); }
            }
        };

        SCI.apply = function () {
            const panel = SCI.getPanel();
            if (!panel || !SCI.enabled) return;
            if (!SCI.flags.master || SCI.getSelCount() > 1) {
                SCI.wipeMarks(panel);
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
                const secScope = new Map();
                for (let i = 0; i < lis.length; i++) {
                    const ci = SCI.compIndexOfRow(lis[i]);
                    if (ci >= 0) {
                        const sec = SCI.sectionOf(lis[i]);
                        if (sec && !secScope.has(sec)) secScope.set(sec, ci);
                    }
                }
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
                    SCI.updateRowStatus(row, kind, refs, svHit, SCI.flags);
                }
            } finally {
                SCI.connect();
            }
        };

        SCI.connect = function () {
            const panel = SCI.getPanel();
            if (!panel) return;
            const sr = panel.shadowRoot;
            // 记下当前接上的 panel/shadowRoot, 供 ensureConnected 检测是否被换掉.
            SCI.panel = panel;
            SCI.sr = sr;
            if (!sr.__sciClick) {
                sr.addEventListener('click', function (e) {
                    const f = window.__SCI && window.__SCI.onClick; if (f) f(e);
                }, true);
                sr.__sciClick = true;
            }
            if (!sr.__sciHover) {
                sr.addEventListener('mouseover', function (e) {
                    const S = window.__SCI; if (!S) return;
                    let el = e.target, badge = null;
                    for (let i = 0; i < 5 && el; i++) {
                        if (el.className === '__sci-indicator') { badge = el; break; }
                        el = el.parentElement;
                    }
                    if (badge) S.showTip(badge);
                }, true);
                sr.addEventListener('mouseout', function (e) {
                    const S = window.__SCI; if (!S) return;
                    let el = e.target, badge = null;
                    for (let i = 0; i < 5 && el; i++) {
                        if (el.className === '__sci-indicator') { badge = el; break; }
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

        // 重发现: inspector dock 被 Cocos 重建后, observer/hover/click 会挂在死的旧 shadowRoot 上
        // (项目开久后标记/hover 失效、需重载项目的根因). 心跳周期调用此函数, 检测当前 panel/shadowRoot
        // 是否被换掉或监听丢失, 一旦发现就丢弃旧 observer 并在新 shadowRoot 上重连 + 重绘.
        SCI.ensureConnected = function () {
            if (!SCI.enabled) return;
            const p = SCI.getPanel();
            if (!p) return;
            const sr = p.shadowRoot;
            if (p !== SCI.panel || sr !== SCI.sr || !sr.__sciHover) {
                if (SCI.observer) { try { SCI.observer.disconnect(); } catch (e) {} SCI.observer = null; }
                SCI.connect();
                SCI.apply();
            }
        };

        SCI.clear = function () {
            SCI.enabled = false;
            if (SCI.heartbeat) { try { clearInterval(SCI.heartbeat); } catch (e) {} SCI.heartbeat = null; }
            SCI.panel = null;
            SCI.sr = null;
            if (SCI.observer) { try { SCI.observer.disconnect(); } catch (e) {} }
            SCI.hideTip();
            if (SCI.tip && SCI.tip.parentNode) { try { SCI.tip.parentNode.removeChild(SCI.tip); } catch (e) {} SCI.tip = null; }
            const panel = SCI.getPanel();
            if (panel) {
                const bs = panel.shadowRoot.querySelectorAll('.__sci-indicator');
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

        let tries = 0;
        (function wait() {
            if (SCI.getPanel()) { SCI.enabled = true; SCI.connect(); SCI.apply(); return; }
            if (tries++ < 20) setTimeout(wait, 300);
        })();
        // 心跳重发现 (要点1 修复): 即使初次 wait 已接上, dock 重建后也能自动重连, 无需重载项目.
        SCI.heartbeat = setInterval(function () { SCI.ensureConnected(); }, 1500);

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

const DEFAULT_FLAGS = { master: true, viz: true, dirty: true, exclude: true };
function normalizeFlags(flags) {
    const f = {};
    for (const k in DEFAULT_FLAGS) f[k] = (flags && typeof flags[k] === 'boolean') ? flags[k] : DEFAULT_FLAGS[k];
    return f;
}

function enableInspectorMark(flags) {
    const f = normalizeFlags(flags);
    forEachWCSimple('window.__SCI_FLAGS = ' + JSON.stringify(f) + ';');
    forEachWCSimple(RESIDENT_SCRIPT);
    forEachWCSimple('window.__SCI && window.__SCI.setFlags && window.__SCI.setFlags(' + JSON.stringify(f) + ');');
    Editor.log('[sc-inspector] Inspector 增强已开 (M1+M2a+P2b). flags=' + JSON.stringify(f)
        + '\n  视觉系统重构: 统一左侧提示容器, 支持 Hover 呈现多状态值表。'
        + '\n  ● 蓝点 = 状态机驱动; 蓝点套黄环 = 当前 state 覆盖 default;'
        + '\n  琥珀色左边框 = 录制脏值;'
        + '\n  ⊘ 灰 = 已排除; ⚠ 红 = 掉出控制; ◐ 黄 = 部分子项未受控。');
}

function setInspectorFlags(flags) {
    const f = normalizeFlags(flags);
    forEachWCSimple('window.__SCI && window.__SCI.setFlags && window.__SCI.setFlags(' + JSON.stringify(f) + ');');
}

function disableInspectorMark() {
    forEachWCSimple('window.__SCI && window.__SCI.clear && window.__SCI.clear()');
    Editor.log('[sc-inspector] Inspector 增强已关 (徽标已撤)');
}

module.exports = {
    probeInspector: probeInspector,
    enableInspectorMark: enableInspectorMark,
    setInspectorFlags: setInspectorFlags,
    disableInspectorMark: disableInspectorMark,
};
