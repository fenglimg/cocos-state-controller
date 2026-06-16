'use strict';

/**
 * Cocos 工程探测：版本号 + .meta uuid 扫描（P3 install/doctor 用）。
 *
 * 版本来源（§12 涌现项收口）：project.json 顶层 version（engine=cocos2d-html5）；
 * 退路 settings/project.json。支持范围 2.4.x，越界只 warn 不硬拦（§7）。
 */

const fs = require('fs');
const path = require('path');
const { walkFiles } = require('./manifest');

const SUPPORTED = Object.freeze({ major: 2, minor: 4 });

const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * canonical uuid → Cocos 序列化里的压缩 uuid（prefab/scene 的 __type__ 引用形态）。
 * 与 tools/migration 同一算法，抽到此处供 migrate / uninstall 引用扫描 / doctor 共用。
 */
function compressUuid(uuid) {
  const hex = String(uuid).replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error(`Invalid uuid: ${uuid}`);
  }
  let out = hex.slice(0, 5);
  for (let i = 5; i < 32; i += 3) {
    const a = parseInt(hex[i], 16);
    const b = parseInt(hex[i + 1], 16);
    const c = parseInt(hex[i + 2], 16);
    out += BASE64_KEYS[(a << 2) | (b >> 2)];
    out += BASE64_KEYS[((b & 3) << 4) | c];
  }
  return out;
}

/**
 * 扫工程内 .prefab/.fire，找仍引用 compressedUuids 的资源（uninstall 引用硬闸）。
 * 序列化资源是对象数组，组件以 item.__type__ = 压缩 uuid 引用脚本。
 * @returns {Array<{ file: string, uuid: string }>} 引用列表（同文件多组件去重到组件粒度）
 */
function scanComponentUsage(projectRoot, compressedUuids, scanDirs = ['assets']) {
  const want = new Set(compressedUuids);
  const refs = [];
  if (!want.size) return refs;
  for (const d of scanDirs) {
    const base = path.join(projectRoot, d);
    if (!fs.existsSync(base)) continue;
    for (const rel of walkFiles(base)) {
      if (!rel.endsWith('.prefab') && !rel.endsWith('.fire')) continue;
      let json;
      try {
        json = JSON.parse(fs.readFileSync(path.join(base, rel), 'utf8'));
      } catch (e) {
        continue; // 坏资源跳过，不阻断卸载判定
      }
      if (!Array.isArray(json)) continue;
      const hits = new Set();
      for (const item of json) {
        if (item && typeof item === 'object' && want.has(item.__type__)) hits.add(item.__type__);
      }
      for (const uuid of hits) refs.push({ file: d + '/' + rel, uuid });
    }
  }
  return refs;
}

/** @returns {{ version: string, source: string } | null} */
function readCocosVersion(projectRoot) {
  for (const rel of ['project.json', 'settings/project.json']) {
    const p = path.join(projectRoot, rel);
    if (!fs.existsSync(p)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j.version && /^\d+\.\d+/.test(String(j.version))) {
        return { version: String(j.version), source: rel };
      }
    } catch (e) {
      /* 坏 json 跳过，继续退路 */
    }
  }
  return null;
}

function isSupportedCocos(version) {
  const m = /^(\d+)\.(\d+)/.exec(version || '');
  return !!m && Number(m[1]) === SUPPORTED.major && Number(m[2]) === SUPPORTED.minor;
}

/**
 * 扫工程内所有 .meta 的 uuid → { uuid: [相对工程根的 posix 路径...] }。
 * 一个 uuid 对多个文件即潜在撞车（异文件同 uuid）。
 */
function scanMetaUuids(projectRoot, scanDirs = ['assets', 'packages']) {
  const map = {};
  for (const d of scanDirs) {
    const base = path.join(projectRoot, d);
    if (!fs.existsSync(base)) continue;
    for (const rel of walkFiles(base)) {
      if (!rel.endsWith('.meta')) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(base, rel), 'utf8'));
        if (j.uuid) (map[j.uuid] = map[j.uuid] || []).push(d + '/' + rel);
      } catch (e) {
        /* 坏 meta 跳过 */
      }
    }
  }
  return map;
}

module.exports = { SUPPORTED, readCocosVersion, isSupportedCocos, scanMetaUuids, compressUuid, scanComponentUsage };
