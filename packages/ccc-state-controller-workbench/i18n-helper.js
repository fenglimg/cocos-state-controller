'use strict';

/**
 * Flat-key i18n helper for ccc-state-controller-workbench.
 *
 * Differences from ccc-smart-component-manager/i18n-helper.js:
 * - Uses flat 'pkg.section.key' style (no nested traversal).
 * - Prefers Editor.T(key) when available, falls back to local zh/en map.
 */

const path = require('path');

const ZH_PATH = path.join(__dirname, 'i18n', 'zh.js');
const EN_PATH = path.join(__dirname, 'i18n', 'en.js');

let zhMap = {};
let enMap = {};

try { zhMap = require(ZH_PATH); } catch (e) { zhMap = {}; }
try { enMap = require(EN_PATH); } catch (e) { enMap = {}; }

function detectLang() {
    try {
        if (typeof Editor !== 'undefined' && Editor.lang) {
            return String(Editor.lang).startsWith('zh') ? 'zh' : 'en';
        }
    } catch (_) { /* fall through */ }
    const locale = (process.env.LANG || process.env.LANGUAGE || '').toLowerCase();
    return locale.indexOf('zh') >= 0 ? 'zh' : 'en';
}

function t(key) {
    if (typeof Editor !== 'undefined' && typeof Editor.T === 'function') {
        const v = Editor.T(`ccc-state-controller-workbench.${key}`);
        if (v && v !== `ccc-state-controller-workbench.${key}`) return v;
    }
    const lang = detectLang();
    const map = lang === 'zh' ? zhMap : enMap;
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : (zhMap[key] || key);
}

module.exports = { t, detectLang };
