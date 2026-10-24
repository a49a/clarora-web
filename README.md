# Clarora 官网

Clarora 客户端的中文项目官网。纯 HTML、CSS 和 JavaScript，无第三方运行依赖、后端或分析追踪。

## 本地预览

需要 Node.js 24：

```sh
npm run dev
```

打开 http://127.0.0.1:4173。可使用 `PORT=4174 npm run dev` 更改端口。

## 构建与部署

```sh
npm run check
npm run build
```

将 `dist/` 部署到任意静态托管平台即可。资源使用相对路径，支持部署在子路径下。不需要 SPA 路由回退。`dist/` 不提交到仓库。

## GitHub Pages

站点地址：<https://a49a.github.io/clarora-web/>（首次部署成功后可访问）。

首次设置：

1. 打开仓库 **Settings → Pages**。
2. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
3. 打开 **Actions → Deploy GitHub Pages → Run workflow**，选择 `master` 运行；如果首次推送的部署失败，也可在启用 Pages 后重跑。

以后推送到 `master` 或 `main` 会自动检查、构建并部署。工作流只上传 `dist/` 中的站点文件，不发布开发脚本或仓库文档；不需要单独的 `gh-pages` 分支或个人访问令牌。

部署流程见 [pages.yml](.github/workflows/pages.yml)，配置参考 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 更新下载入口

下载信息唯一来源是根目录的 `release-metadata.json`（`config.js` 与页面令牌都是
构建产物，不要手改）。CI 在线构建会先从 GitHub Releases API 拉取最新版本合并到
这份元数据上，桌面默认使用主版本；本地无网络时使用本地快照。主版本尚未发布时，
本地桌面入口保留待发布状态，不使用旧 RN 桌面安装包。客户端发布后需另行触发官网部署。

本地开发预览使用与部署完全相同的渲染管线：

```sh
npm run dev        # 先构建 dist/ 再启动 http://127.0.0.1:4173
```

需要固定某个版本的元数据时（如直接消费客户端 Release 随包发布的
`release-metadata.json`，同一 schema）：

```sh
CLARORA_RELEASE_METADATA=/path/to/release-metadata.json npm run build
```

`repository` 指向客户端源码仓库。尚未发布的平台保持 `planned`，页面会提供构建指南。

## 页面内容

- 客户端功能介绍：闪卡、听力、AI、专注工具与本地资料。
- 交互示意：翻卡、收藏、无音频的字幕进度演示，以及预设 AI 问答。
- 四平台状态与构建指南、命令复制、数据与同步 FAQ。

功能示意不会发送 AI 请求或持久化学习数据。主要内容在禁用 JavaScript 时仍可阅读。发布状态在构建时从配置与 GitHub 解析；离线预览使用本地快照，访客浏览时不查询 GitHub。

文案基于 Clarora 客户端 README 与平台、同步文档；客户端能力变化时同步更新官网，避免把源码支持描述为已完成安装包或真机验收。

## 移动端发布元数据

`mobile_release` 显式固定移动端的 RN tag、版本与来源 SHA，当前为 `v0.2.1`；历史 `vX.Y.Z` 和未来 `rn-vX.Y.Z` 均可指定。在线构建核对该 RN Release 的真实 APK 与元数据，主版本没有 APK 不会撤掉独立 RN 移动入口。移动卡片显示自己的版本与 RN 标记，桌面使用主版本，不显示实现框架标记。

iOS 从指定 RN Release 附带的 `release-metadata.json` 读取渠道，要求 version/tag/source_sha 对应；仅接受明确 released 的 TestFlight 或 App Store URL，不提供普通 IPA 下载。没有渠道或 URL 不合法时显示构建指南。显式元数据文件可携带同结构 `mobile_release`，否则使用本地固定的移动快照；不会从主版误取 APK。

渠道信息放在 `mobile_release.platforms` 内。例如 iOS：`"ios": {"status": "released", "channel": "testflight", "url": "https://testflight.apple.com/join/AbCd1234"}`（示例地址不能用于生产）。当前 Android APK 固定在 RN `v0.2.1`，不能拼接主版本的资产目录。只有确认渠道已开放后才能设置 released。

客户端发布不会自动触发本仓库 Pages；需另行触发官网构建部署。
