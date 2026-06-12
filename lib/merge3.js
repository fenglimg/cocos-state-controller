'use strict';

/**
 * 三方合并（P2 三方引擎核心，update 与 sync 共用）。
 *
 * 语义（docs/cli-architecture-plan.md §5.1）：base=vX pristine, ours=consumer 当前, theirs=vY 新版。
 *  - 自动并无冲突的 hunk；真冲突打 <<<<<<< / ======= / >>>>>>> 标记留人/AI 解。
 *
 * 实现：复用系统 git merge-file（标准 diff3，CI 必有 git），不造行级合并轮子。
 * 快速路径先短路三种平凡情形，省进程开销。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * @returns {{ conflict: boolean, content: string }}
 */
function merge3(base, ours, theirs, opts = {}) {
  // 快速路径：平凡情形不必起 git。
  if (ours === theirs) return { conflict: false, content: ours };
  if (ours === base) return { conflict: false, content: theirs }; // 本地没动 → 直接取新版
  if (theirs === base) return { conflict: false, content: ours }; // 上游没动 → 保留本地

  const labels = {
    ours: opts.oursLabel || 'ours (consumer)',
    base: opts.baseLabel || 'base (installed version)',
    theirs: opts.theirsLabel || 'theirs (new version)',
  };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csc-m3-'));
  const fo = path.join(dir, 'ours');
  const fb = path.join(dir, 'base');
  const ft = path.join(dir, 'theirs');
  fs.writeFileSync(fo, ours);
  fs.writeFileSync(fb, base);
  fs.writeFileSync(ft, theirs);

  let content;
  let conflict = false;
  try {
    content = execFileSync(
      'git',
      ['merge-file', '-p', '-L', labels.ours, '-L', labels.base, '-L', labels.theirs, fo, fb, ft],
      { encoding: 'utf8' }
    );
  } catch (e) {
    // git merge-file 冲突时 exit code = 冲突段数(>0)，stdout 仍是带标记的合并结果。
    if (e.stdout != null) {
      content = e.stdout.toString();
      conflict = true;
    } else {
      fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { conflict, content };
}

module.exports = { merge3 };
