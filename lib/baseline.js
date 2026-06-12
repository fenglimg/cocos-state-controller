'use strict';

/**
 * 基线重建（P2 三方引擎，update 与 sync 共用）。
 *
 * 从 lock.packageVersion 出发 `npm pack <pkg>@vX` 解出 pristine 净荷
 * （npm 发布版不可变，永远可重建，不在 consumer 囤原件 —— §5）。
 *
 * fetchTarball / extract 可注入，便于单测不打真实 registry。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** 默认取包：npm pack pkg@version → workDir，返回 tarball 绝对路径。 */
function npmPackFetch(pkg, version, workDir) {
  const spec = version ? `${pkg}@${version}` : pkg;
  const out = execFileSync('npm', ['pack', spec, '--pack-destination', workDir, '--json'], {
    encoding: 'utf8',
  });
  const arr = JSON.parse(out);
  return path.join(workDir, arr[0].filename);
}

/** 默认解包：tar -xzf tarball → workDir；npm 净荷在 package/ 下。 */
function tarExtract(tarball, workDir) {
  execFileSync('tar', ['-xzf', tarball, '-C', workDir]);
  return path.join(workDir, 'package');
}

/**
 * @param {{ pkg: string, version?: string, workDir?: string,
 *           fetchTarball?: Function, extract?: Function }} opts
 * @returns {string} pristine 净荷根目录（解包后的 package/）
 */
function reconstructBaseline(opts) {
  const { pkg, version, fetchTarball = npmPackFetch, extract = tarExtract } = opts;
  const dir = opts.workDir || fs.mkdtempSync(path.join(os.tmpdir(), 'csc-base-'));
  const tarball = fetchTarball(pkg, version, dir);
  return extract(tarball, dir);
}

module.exports = { reconstructBaseline, npmPackFetch, tarExtract };
