# 上行回流 PR

把 consumer 工程里对 managed 文件（runtime + panel）的本地改动，回流到源仓
`github.com/fenglimg/cocos-state-controller`。CLI 算差异（确定性），你（AI）做判断与编排（看懂改动、按政策取舍、写提交、开 PR）。

## 前置
- consumer 工程已 `csc install`（存在 `.csc/lock.json`）。
- 已装 `gh` CLI 且登录（`gh auth status`）。

## 流程

### 1. 算上行差异（CLI 确定性步骤）
```bash
csc sync --upstream --output /tmp/upstream.patch
```
- 输出是 canonical 路径（源仓布局）标签的 unified diff，含 modified / added / removed。
- 范围只 managed runtime+panel，不含 tests（CLI 已保证）。
- 无改动则结束，无需 PR。

### 2. 按漂移政策取舍（本流程的判断核心）
逐个 hunk 审查，**只回流符合单一规范形态的改动**：
- ✅ **真实 bug fix / 功能改进** → 收入 PR。
- ✅ **两端通吃的 env 收敛写法**（如统一 `Array.from(new Set())`）→ 收入。
- ❌ **per-consumer 本地 env 适配**（只为本工程打补丁）→ **剔除**，这是源仓 bug，应在源仓两端通吃地修，而非把单边适配上行。
- ❌ **路径/安装位置差异** → 剔除（CLI 反归一化应已消除；若残留说明归一化漏了，记 issue）。
- ❌ **平台分支硬 fork 文件** → 剔除，改用 in-file `CC_EDITOR` 守卫的写法再上行。

把保留的 hunk 重组成干净 patch（可拆多个逻辑提交）。

### 3. 在源仓开 PR
```bash
git clone https://github.com/fenglimg/cocos-state-controller /tmp/scv2-src   # 若未克隆
cd /tmp/scv2-src
git checkout -b upstream/<简短主题>
git apply /tmp/upstream.patch    # 或仅 apply 取舍后保留的 hunk
```
- patch 路径已是源仓 canonical 布局，直接 `git apply` 落位。
- 若源仓 main 已领先，按标准 PR 流程：git 三方合并 / rebase 后再提。

### 4. 写提交 + 开 PR
- 提交信息用中文，格式 `类型: 简短描述`（feat/fix/refactor…）。
- 每个逻辑改动一个提交，说清「为什么这是两端通吃的改动，而非单边适配」。
```bash
git commit -am "fix(controller): <说清根因与通吃理由>"
git push -u origin upstream/<主题>
gh pr create --repo fenglimg/cocos-state-controller \
  --title "<类型: 描述>" \
  --body "$(cat <<'EOF'
## 来源
consumer 工程上行回流（csc sync --upstream）。

## 改动取舍（漂移政策）
- 收入：<列保留的改动 + 通吃理由>
- 剔除：<列剔除的本地适配 + 原因>

## 验证
源仓 CI（release workflow）跑全测试门禁。
EOF
)"
```

## 不变量
- **绝不上行 per-consumer 单边适配**；要适配就在源仓两端通吃地改。
- **绝不动 canonical `.meta` uuid**（包独占固定）。
- patch 范围只 managed 文件；consumer 业务代码不回流。
- 拿不准某 hunk 是否「通吃」时，停下问人，不擅自上行。
