'use strict';

/**
 * 文件集差异（P2 三方引擎，供 csc diff / sync / update 分类用）。
 *
 * 输入两份 manifest（{ canonical路径: 指纹 }，即 lock.files 形态），
 * 产出 added / removed / modified 三类（docs/cli-architecture-plan.md §5.2 / §10 diff）。
 * 纯指纹比对，指纹本身已基于归一化内容（行尾/路径无关），跨平台稳定。
 */

/**
 * @param {Record<string,string>} base  基线 manifest（装的版本 pristine）
 * @param {Record<string,string>} curr  当前 manifest（consumer 现状 / 新版）
 * @returns {{ added: string[], removed: string[], modified: string[] }}
 */
function diffManifests(base, curr) {
  const added = [];
  const removed = [];
  const modified = [];

  for (const p of Object.keys(curr)) {
    if (!(p in base)) added.push(p);
    else if (curr[p] !== base[p]) modified.push(p);
  }
  for (const p of Object.keys(base)) {
    if (!(p in curr)) removed.push(p);
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    modified: modified.sort(),
  };
}

/** 是否存在任何差异。 */
function hasChanges(d) {
  return d.added.length > 0 || d.removed.length > 0 || d.modified.length > 0;
}

module.exports = { diffManifests, hasChanges };
