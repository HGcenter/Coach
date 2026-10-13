# 禾光思想阅读站 · 第一版

面向 `https://hgthink.cn`，沿用已确认的深绿与米白界面。第一版含 10 篇公众号已发布文章，以及首页、文章归档、5 个主题页、新读者入口、清醒空间、关于页、404、全文搜索、RSS 和站点地图。

最新四篇已补入完整正文，并使用公众号最终标题和日期：

| 发布日期 | 标题 | 文章文件 |
| --- | --- | --- |
| 2026-10-08 | 细数人生有多少个“不可能三角” | `content/articles/impossible-triangles.md` |
| 2026-09-30 | 458 个创始人的故事，都在重复这 5 件事 | `content/articles/founders-five-practices.md` |
| 2026-09-21 | AI创业时代：别急着创业 | `content/articles/ai-startup-judgment.md` |
| 2026-09-10 | 空枪：不认命，也是一种命运 | `content/articles/loaded-by-defiance.md` |

其余 6 篇来自原预览中的早期文章和清醒空间，均重新读取了公众号最终正文。原本地记录的《强哥：一个不认命的人，最后走向了哪里》和《你以为你看见了对方，其实看见的是自己的判断》，实际公众号标题分别为《空枪：不认命，也是一种命运》和《我们从未看见彼此？你看见的是你》。原始资料和旧预览保留，不被覆盖。

## 先查看网页

有 Node.js 22 或更高版本、pnpm 11.19.0 的环境，在本目录运行：

```text
pnpm install --frozen-lockfile
pnpm dev
```

打开终端输出的 `http://127.0.0.1:4180/`。首次运行会先构建网页。本地服务器只监听本机，并发送 noindex 响应头；生成的正式文件按可收录网站配置。

其他命令：

```text
pnpm test          验证新增文章、草稿、删除文章、子目录部署
pnpm build         生成 dist 文件夹
pnpm check         检查所有内部链接、配图、SEO 元数据和索引
```

`dist` 是生成结果，不需要每次手动上传，也不应拿它覆盖源文件。页面使用站点根路径，请通过本地服务器预览，不要直接双击 dist 中的 HTML。

## 一次性上传 GitHub

1. 建立一个专用仓库，例如 `hgthink-reading`，默认分支使用 `main`。GitHub Free 的 Pages 使用公开仓库。
2. 上传**本目录的源码内容**到仓库根目录，包含 `package.json`、`pnpm-lock.yaml`、`site.config.json`、`content`、`public`、`scripts`、`tests`、`.github` 和 `.gitignore`。不要上传 `node_modules`、`dist` 或整个 Founders 工作目录。
3. 如果收到的是 ZIP，先解压；GitHub 不会自动把上传的 ZIP 解开并当作网站源码。
4. GitHub Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
5. 到 Actions 运行或查看 **Build and deploy reading site**。首次可手动 Run workflow；随后每次向 `main` 提交文件都会自动构建和部署。
6. 先检查工作流给出的默认 GitHub Pages 网站地址。工作流会读取 Pages 的 origin 和 base_path，兼容默认项目网址和独立域名；不是写死一个用户名。
7. 按域名接入说明配置 `hgthink.cn`。设置正确以后，再运行一次工作流，更新网页 canonical、RSS、sitemap 中的实际域名。

**`.github/workflows/deploy.yml` 必须进入仓库。** 若网页上传工具没有保留 `.github` 文件夹，可在仓库 Add file → Create new file，文件名输入 `.github/workflows/deploy.yml`，粘贴本地同名文件内容并提交。没有这个文件，上传 Markdown 不会自动更新网站。

工作流先测试，再生成和检查网页，最后只发布 `dist` 静态文件。源码仓库只保存可公开内容；草稿即使不进入网站，也会被公开源码仓库的访问者看到，所以私密草稿请保留在本地。

## 以后如何发布一篇文章

1. 公众号发布后，把最终正文、标题、日期和原文链接交给我。
2. 我整理一份新的 `.md` 文件，格式见 `docs/article-template.md`。有配图时，同时准备 `public/images` 中的文件。
3. 在 GitHub 打开 `content/articles`，Add file → Upload files，上传新 Markdown 并提交到 `main`。有新图，再上传到 `public/images`。
4. Actions 自动运行。完成后，新文章网页、首页入口、文章列表、主题页、全文搜索、RSS 和 sitemap 同步更新。

你不用上传新的 `index.html`。修改旧文章时，保持 `slug` 不变，填写 `updated_at`，替换同名 Markdown；它的网址就会保持稳定。

文章头部：

```yaml
---
title: '文章标题'
slug: new-article
published_at: '2026-10-10T20:00:00+08:00'
topic: decision-system
description: '帮助新读者理解文章的简洁摘要。'
tags: [判断, 压力]
wechat_url: https://mp.weixin.qq.com/s/真实原文ID
status: published
---
正文……
```

可用栏目：`decision-system`、`founder-research`、`tianyan`、`everyday-reading`、`clarity`。`status: draft` 不生成网页；`published` 代表已经确认可以公开，日期不会自动判断公众号是否已发布。

图片写法：`![具体描述](/images/文件名.webp)`。构建要求配图来自本地站点资源，避免微信防盗链影响阅读。所有配图缺失、文章元数据不合法、重复 slug 或重复原文链接会让检查或构建失败，阻止部署。

首页文章列表按发布日期自动排序。精选文章由 `site.config.json` 的 `featured` 指定；如不指定有效文章，会采用最新文章。栏目和站点标题也在该配置文件中维护。

## 公众号二维码

目前用微信搜索「禾光思想」作为关注路径，公众号原文链接可使用，没有放置虚构二维码。

拿到真实二维码后，保存到 `public/images/wechat-qr.png`，将 `site.config.json` 的 `wechatQr` 改成 `/images/wechat-qr.png`。所有关注区会随下次构建统一更新。

## 独立域名接入

先在 GitHub 账户 Pages 设置按提示添加 TXT，验证 `hgthink.cn`。再到仓库 Settings → Pages → Custom domain 填 `hgthink.cn` 并保存，之后在 DNS 服务商设置：

| 类型 | 主机 | 值 |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | `你的GitHub用户名.github.io`，或对应组织域名 |
| TXT | GitHub 指定的验证主机 | GitHub 给出的验证值 |

核对已有的网站 A / AAAA / CNAME，避免冲突；保留邮箱相关记录。解析与证书生效后开启 Enforce HTTPS，检查 www 与主域名跳转。使用本仓库 Actions 发布时，以 Pages 设置中的 Custom domain 为准，不依赖 CNAME 文件。

代码准备好不等于已上线。本次没有创建远程仓库、推送代码、修改 DNS 或完成搜索平台验证；部署需要确定 GitHub 目标和域名服务商。

上线后，在 Google Search Console 与百度搜索资源平台验证新域名并提交 `https://hgthink.cn/sitemap.xml`。本地检查通过不保证搜索平台即时收录。

## 第一版实现说明

使用 Node.js、Marked、YAML 的轻量静态构建，替代设计阶段提出的 Astro 方案。对这个文章站，两种方案的核心行为相同：发布时生成完整 HTML，正文和文章入口无需 JavaScript 才能出现。当前版本只有两个构建依赖，没有数据库或账户系统。

搜索索引在页面打开时加载，完整正文只在读者浏览器内检索。清醒空间输入只留在当前页，可以下载笔记或清空，不上传，不自动保存。

源码与部署采用 GitHub Pages；付费结算、会员或商业 SaaS 功能不在本版范围内，需要时可保留源码仓库并另选托管。国内访问的实际表现应在上线后用读者网络检验。
