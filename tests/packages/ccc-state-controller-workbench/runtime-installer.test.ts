const fs = require('fs');
const os = require('os');
const path = require('path');
const installer = require('packages/ccc-state-controller-workbench/lib/runtime-installer');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('runtime-installer', () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('listRuntimeFiles only returns ts and meta files recursively', () => {
    const sourceDir = makeTempDir('scw-source-');
    tempDirs.push(sourceDir);

    fs.mkdirSync(path.join(sourceDir, 'Props'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'StateController.ts'), '// test');
    fs.writeFileSync(path.join(sourceDir, 'StateController.ts.meta'), '{}');
    fs.writeFileSync(path.join(sourceDir, 'Props', 'StateToolsProps.ts'), '// test');
    fs.writeFileSync(path.join(sourceDir, 'ignore.txt'), 'ignored');

    expect(installer.listRuntimeFiles(sourceDir, sourceDir)).toEqual([
      'Props/StateToolsProps.ts',
      'StateController.ts',
      'StateController.ts.meta',
    ]);
  });

  test('getDefaultSourceDir and getRuntimeStatus resolve source-target metadata', () => {
    const projectDir = makeTempDir('scw-project-');
    tempDirs.push(projectDir);

    const sourceDir = installer.getDefaultSourceDir(projectDir);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'StateController.ts'), '// controller');
    fs.writeFileSync(path.join(sourceDir, 'StateSelect.ts'), '// select');
    fs.writeFileSync(path.join(sourceDir, 'StateEnum.ts'), '// enum');
    fs.writeFileSync(path.join(sourceDir, 'StatePropHandler.ts'), '// handler');

    const status = installer.getRuntimeStatus({
      projectPath: projectDir,
      sourceDir,
      targetDir: sourceDir,
    });

    expect(sourceDir).toBe(path.join(projectDir, 'assets', 'script', 'Controller'));
    expect(status.sourceExists).toBe(true);
    expect(status.sourceFileCount).toBe(4);
    expect(status.sameAsSource).toBe(true);
    expect(status.target.installed).toBe(true);
  });

  test('detectRuntime reports missing required files', () => {
    const targetDir = makeTempDir('scw-target-');
    tempDirs.push(targetDir);

    fs.writeFileSync(path.join(targetDir, 'StateController.ts'), '// test');

    const result = installer.detectRuntime(targetDir);
    expect(result.installed).toBe(false);
    expect(result.matchedFiles).toEqual(['StateController.ts']);
    expect(result.missingFiles).toEqual(
      expect.arrayContaining(['StateSelect.ts', 'StateEnum.ts', 'StatePropHandler.ts']),
    );
  });

  test('installRuntime copies runtime files and reports noop for source target equality', () => {
    const sourceDir = makeTempDir('scw-runtime-source-');
    const targetDir = makeTempDir('scw-runtime-target-');
    tempDirs.push(sourceDir, targetDir);

    fs.mkdirSync(path.join(sourceDir, 'Props'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'StateController.ts'), '// controller');
    fs.writeFileSync(path.join(sourceDir, 'StateSelect.ts'), '// select');
    fs.writeFileSync(path.join(sourceDir, 'StateEnum.ts'), '// enum');
    fs.writeFileSync(path.join(sourceDir, 'StatePropHandler.ts'), '// handler');
    fs.writeFileSync(path.join(sourceDir, 'Props', 'StateToolsProps.ts'), '// tools');

    const installResult = installer.installRuntime({
      projectPath: '',
      sourceDir,
      targetDir,
      overwrite: true,
    });

    expect(installResult.success).toBe(true);
    expect(installResult.action).toBe('install');
    expect(installResult.copiedFiles).toEqual(
      expect.arrayContaining([
        'StateController.ts',
        'StateSelect.ts',
        'StateEnum.ts',
        'StatePropHandler.ts',
        'Props/StateToolsProps.ts',
      ]),
    );

    const noopResult = installer.installRuntime({
      projectPath: '',
      sourceDir,
      targetDir: sourceDir,
      overwrite: true,
    });

    expect(noopResult.success).toBe(true);
    expect(noopResult.action).toBe('noop');
    expect(noopResult.message).toMatch(/already the active runtime source/i);
  });
});
