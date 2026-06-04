'use strict';

/**
 * State Controller Panel 注册入口
 *
 * 类似 Polymer-style 的注册模式。由于是 Cocos 2.x 面板入口，
 * 此脚本由 Editor 直接执行。在此处读取 CSS 和 HTML 内容，
 * 并与 logic.js 的行为组合，生成并导出 Editor.Panel。
 */

const fs = require('fs');
const path = require('path');
const logic = require('./logic');

const style = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

const panelConfig = Object.assign({
    style: style,
    template: template,
}, logic);

module.exports = Editor.Panel.extend(panelConfig);
