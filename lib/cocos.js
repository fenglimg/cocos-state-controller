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

module.exports = { SUPPORTED, readCocosVersion, isSupportedCocos, scanMetaUuids };
