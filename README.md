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
这份元数据上；本地无网络时直接使用本地文件。发布新版本通常不需要改这个仓库——
部署工作流会自动带上新版本号、固定下载链接和来源 SHA。

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

功能示意不会发送 AI 请求或持久化学习数据。主要内容在禁用 JavaScript 时仍可阅读。发布状态通过配置维护，不自动查询 GitHub。

文案基于 Clarora 客户端 README 与平台、同步文档；客户端能力变化时同步更新官网，避免把源码支持描述为已完成安装包或真机验收。
