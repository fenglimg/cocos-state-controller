'use strict';

/**
 * 路径与内容归一化（P1 核心数据层）。
 *
 * 两个独立维度（docs/cli-architecture-plan.md §2/§4/§12）：
 *  1. 内容归一化 normalizeContent：CRLF/CR → LF，让指纹跨平台稳定（env 差异两端通吃）。
 *  2. 文件路径归一化 normalizePath/denormalizePath：consumer 可配置安装位置 ↔ 源仓 canonical 位置 互转。
 *     —— lock.files 的 key 与上行 diff 都以 canonical 路径表达，install 时反归一化到实际安装位置。
 *
 * 注：panel handlers.js 内部「require runtime 的安装路径前缀」重写属 §12 待细化项，
 * 依赖真实 panel 形态，留 P3 install/diff 落地（见 normalizeRequires 占位）。
 */

const path = require('path');

/** 源仓 canonical 布局（固定，不随 consumer 安装位置变）。 */
const CANONICAL = Object.freeze({
  runtime: 'assets/script/controller',
  panel: 'packages/state-controller-v2-panel',
});

/** 任意分隔符 → posix '/'，跨平台路径比较统一。 */
function toPosix(p) {
  return String(p).split(path.sep).join('/').split('\\').join('/');
}

/** 内容归一化：CRLF/CR → LF。指纹与三方比对都基于归一化后内容。 */
function normalizeContent(content) {
  const s = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** 在 from→to 的前缀映射表里替换路径前缀；命中则替换，否则原样返回。 */
function remapPrefix(relPath, mappings) {
  const rp = toPosix(relPath);
  for (const [from, to] of mappings) {
    const f = toPosix(from);
    if (rp === f) return toPosix(to);
    if (rp.startsWith(f + '/')) return toPosix(to) + rp.slice(f.length);
  }
  return rp;
}

/** consumer 安装路径 → 源仓 canonical 路径。 */
function normalizePath(relPath, installPaths) {
  if (!installPaths) return toPosix(relPath);
  const mappings = Object.keys(CANONICAL)
    .filter((k) => installPaths[k])
    .map((k) => [installPaths[k], CANONICAL[k]]);
  return remapPrefix(relPath, mappings);
}

/** 源仓 canonical 路径 → consumer 安装路径（normalizePath 的逆）。 */
function denormalizePath(canonicalPath, installPaths) {
  if (!installPaths) return toPosix(canonicalPath);
  const mappings = Object.keys(CANONICAL)
    .filter((k) => installPaths[k])
    .map((k) => [CANONICAL[k], installPaths[k]]);
  return remapPrefix(canonicalPath, mappings);
}

/**
 * 占位（§12 待细化）：归一化 panel 文件内容里对 runtime 的 require 安装路径前缀。
 * 需待 P3 拿到真实 panel handlers.js 的 require 形态后定精确正则。当前直通。
 */
function normalizeRequires(content /*, installPaths */) {
  return content;
}

module.exports = {
  CANONICAL,
  toPosix,
  normalizeContent,
  normalizePath,
  denormalizePath,
  normalizeRequires,
};
