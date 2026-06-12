'use strict';

/**
 * sync-manifest 读取与 managed 文件枚举（P3 install/diff/doctor 共用）。
 *
 * manifest（tools/state-controller-sync-manifest.json）的 targetMappings 描述各 managed 类别。
 * install 只拷「装进 consumer 工程」的类别（runtime + panel）；migration 工具与 skills
 * 留在 npm 包内供 CLI 自身用（csc migrate / csc skill install），不落 consumer 工程。
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_REL = 'tools/state-controller-sync-manifest.json';
const INSTALL_TARGETS = ['controller-v2', 'editor-panel'];

function readManifest(payloadRoot) {
  return JSON.parse(fs.readFileSync(path.join(payloadRoot, MANIFEST_REL), 'utf8'));
}

/** 递归列 dir 下所有文件，返回相对 dir 的 posix 路径数组。 */
function walkFiles(dir, exclude = []) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (exclude.includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      for (const sub of walkFiles(full, exclude)) out.push(ent.name + '/' + sub);
    } else {
      out.push(ent.name);
    }
  }
  return out;
}

/**
 * 枚举净荷里所有 install 类 managed 文件。
 * @returns {Array<{ category: string, canonical: string, abs: string }>}
 *   canonical = 源仓相对路径（= lock.files 的 key 形态）；abs = 净荷内绝对路径。
 */
function enumerateManagedFiles(payloadRoot, manifest) {
  const m = manifest || readManifest(payloadRoot);
  const files = [];
  for (const map of m.targetMappings) {
    if (!INSTALL_TARGETS.includes(map.name)) continue;
    const srcDir = path.join(payloadRoot, map.source);
    for (const rel of walkFiles(srcDir, map.exclude || [])) {
      files.push({
        category: map.name,
        canonical: map.source + '/' + rel,
        abs: path.join(srcDir, rel),
      });
    }
  }
  return files;
}

module.exports = { MANIFEST_REL, INSTALL_TARGETS, readManifest, walkFiles, enumerateManagedFiles };
