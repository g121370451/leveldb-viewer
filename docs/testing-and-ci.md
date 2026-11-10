# 本地测试与 GitHub Actions

## 先手动试用

有两种方法，任选一种。

### 安装 VSIX

1. 在 VS Code 扩展面板右上角的 `…` 菜单选择 **Install from VSIX… / 从 VSIX 安装…**。
2. 选择项目目录中的 `leveldb-viewer-1.1.0.vsix`，按提示重新加载窗口。
3. 打开命令面板，执行 **LevelDB Viewer: Open Database**。
4. 选择数据库目录。Windows 可以在资源管理器地址栏输入：

   ```text
   %LOCALAPPDATA%\Packages\52299SuperElement.119436511DDC8_792yctbvabkar\LocalState\EBWebView\Default\IndexedDB\file__0.indexeddb.leveldb
   ```

应用的安装来源不同，目录也可能不同。应选包含 `CURRENT` 和 `MANIFEST-*` 的目录，不是单个 `.ldb` 文件。

如果曾安装发布者为 `local` 的测试版，请先卸载 `local.leveldb-viewer`，安装当前包后执行 **Developer: Reload Window / 开发人员: 重新加载窗口**。当前包沿用正式身份 `g121370451.leveldb-viewer`，不会作为另一个同名扩展并存。

### F5 调试源码

1. 用 VS Code 打开本项目目录，终端运行 `npm ci`。
2. 按 F5，选择 **Run LevelDB Viewer Extension**。
3. VS Code 会编译并打开 Extension Development Host 窗口。在新窗口中执行打开数据库命令。
4. 修改源码后停止并重新启动调试，即可使用最新代码。无需反复安装 VSIX。

项目已有 `.vscode/launch.json`，编译任务使用 VS Code 自动发现的 `npm: compile`。若任务自动发现被禁用，先运行 `npm run compile`，并启用 npm 任务自动发现。

## 建议验收的场景

| 操作 | 预期 |
| --- | --- |
| 打开 Focus To-Do 的数据库 | 出现数据库、对象仓库和记录数量，不再只有 comparator 错误。 |
| 选中 Project 或 Task 的一条记录 | 显示解码对象；Task 没有数据时显示空列表是正常情况。 |
| 切换 Raw bytes | 显示原始十六进制数据。 |
| 搜索某条记录的字段值 | 当前页搜索只检查这一页；Entire selection 搜索整个选中的对象仓库。 |
| 在 Focus To-Do 中添加任务，再按 Refresh | 在对应仓库看到新记录；若应用正写入，可能需要稍后再刷新。 |
| 翻页、切换 Tree | 不会把第一页数量当成整个数据库数量；树形按当前页文本键分组。 |
| 点击 Cancel | 当前工作停止后恢复操作；已有成功快照仍可使用。 |
| 选择不完整数据库或未知格式 | 得到具体原因，不显示成读取成功的空库。 |

## 本地自动检查

使用 Node.js 24，运行：

```powershell
npm ci
npm run format:check
npm test
npm run test:ui
npm run package
```

本地与 Windows CI 都使用 Edge。GitHub 的 Windows runner 已预装 Edge，工作流仍显式运行 `npx playwright install msedge` 确保浏览器可用。你也可以在本地选择 Playwright 下载的 Chromium：

```powershell
npx playwright install chromium
$env:VIEWER_BROWSER = 'chromium'
npm run test:ui
```

测试使用程序生成的数据库，不需要在 CI 上安装 Focus To-Do，也不上传个人数据库。`artifacts/` 保存测试生成的界面截图，`*.vsix` 是打包产物；两者都被 Git 忽略。

## CI/CD 是如何工作的

GitHub Actions 在 GitHub 提供的临时机器上执行仓库里的工作流。

```text
push / pull request / 手动运行
  → 拉取代码、准备 Node.js、npm ci
  → 格式检查、存储与解码测试、浏览器联调
  → 打包 VSIX
  → 上传安装包与截图，供下载
```

- **CI（持续集成）**：检查每次修改是否能编译、通过测试。这里对应格式检查与自动测试。
- **CD（持续交付或持续部署）**：将通过检查的版本交付给使用者。当前工作流提供可下载安装包，没有自动创建 GitHub Release，也没有发布到 VS Code Marketplace。

工作流在 `.github/workflows/ci.yml`，当前只验证 Windows。`npm ci` 使用提交的 `package-lock.json` 安装固定依赖；每次运行都是干净环境，不会使用你电脑上的 `node_modules`。Node.js 下载缓存会加速后续运行，但不会替代依赖安装。

## 第一次在 GitHub 上运行

1. 检查本地改动，将本次源码、测试、构建脚本、`package.json`、`package-lock.json` 和 `.github/workflows/ci.yml` 一起提交并推送。工作流依赖这些文件，不能只提交 YAML。
2. 打开 GitHub 仓库的 **Actions** 标签页，选择 **Test and package**。
3. 打开最新运行，查看每个步骤的日志。绿色代表通过；红色时展开失败步骤，先处理其中的具体错误。
4. 全部通过后，在运行详情底部的 **Artifacts** 下载 `leveldb-viewer-vsix`。解压下载的 ZIP，再用 VS Code 安装里面的 `.vsix`。
5. `viewer-ui-screenshots` 是合成测试数据的界面截图。安装包保留 14 天，截图保留 7 天。

如果 GitHub 提示未启用 Actions，按仓库页面提示启用。`workflow_dispatch` 允许手动运行；工作流文件进入仓库默认分支后，通常可在 Actions 页面看到 **Run workflow** 按钮。第一次也可以直接用 push 触发，不依赖手动按钮。

本工作流不需要手动设置 Secret，仓库令牌权限只有 `contents: read`。PR 上运行检查并不等于禁止合并；如果希望必须绿灯才能合并，再在仓库规则中把 **Windows tests and VSIX** 设置为必需状态检查。

外部贡献者的 PR 可能需要维护者首次批准工作流。GitHub 的运行额度和存储额度取决于仓库与账号计划。

参考：[GitHub Actions 基本概念](https://docs.github.com/en/actions/get-started/understand-github-actions)、[下载工作流产物](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/downloading-workflow-artifacts)。
