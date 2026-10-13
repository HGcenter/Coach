import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import { parse as parseYaml } from 'yaml';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const dateLabel = value => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const plainText = html => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function normalizedBase(value) {
  if (!value || value === '/') return '';
  if (!/^\/[a-zA-Z0-9/_-]+\/?$/.test(value)) throw new Error('BASE_PATH 必须是安全的网站路径，如 /hgthink-reading');
  return value.replace(/\/$/, '');
}

function validDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2}))?$/.test(value)) throw new Error(`${label} 请使用加引号的日期，如 '2026-10-08T20:00:00+08:00'`);
  const timestamp = value.length === 10 ? `${value}T00:00:00+08:00` : value;
  const year = Number(value.slice(0, 4)); const month = Number(value.slice(5, 7)); const day = Number(value.slice(8, 10));
  const limit = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!Number.isFinite(Date.parse(timestamp)) || month < 1 || month > 12 || day < 1 || day > limit) throw new Error(`${label} 不是有效日期`);
  return timestamp;
}

export function parseArticle(source, filename, topicSlugs) {
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: 缺少文章头部元数据`);
  const data = parseYaml(match[1], { uniqueKeys: true });
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${filename}: 元数据应为对象`);
  if (!['published', 'draft'].includes(data.status)) throw new Error(`${filename}: status 只能是 published 或 draft`);
  if (data.status === 'draft') return null;
  for (const key of ['title', 'slug', 'topic', 'description', 'wechat_url']) {
    if (typeof data[key] !== 'string' || !data[key].trim()) throw new Error(`${filename}: 缺少 ${key}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) throw new Error(`${filename}: slug 只使用小写英文、数字和连字符`);
  if (!topicSlugs.includes(data.topic)) throw new Error(`${filename}: 未知栏目 ${data.topic}`);
  const wechat = new URL(data.wechat_url);
  if (wechat.protocol !== 'https:' || wechat.hostname !== 'mp.weixin.qq.com' || !/^\/s\/[A-Za-z0-9_-]+$/.test(wechat.pathname) || wechat.search || wechat.hash) throw new Error(`${filename}: 请填写公众号短链接 https://mp.weixin.qq.com/s/...`);
  data.published_at = validDate(data.published_at, `${filename} published_at`);
  if (data.updated_at) {
    data.updated_at = validDate(data.updated_at, `${filename} updated_at`);
    if (Date.parse(data.updated_at) < Date.parse(data.published_at)) throw new Error(`${filename}: 修订日期不能早于发布日期`);
  }
  if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some(tag => typeof tag !== 'string'))) throw new Error(`${filename}: tags 应为文字列表`);
  if (!match[2].trim()) throw new Error(`${filename}: 正文为空`);
  return { ...data, tags: data.tags || [], author: data.author || '禾光思想', body: match[2].trim() };
}

export async function buildSite({ root = projectRoot, outDir = path.join(root, 'dist'), origin = process.env.SITE_URL, basePath = process.env.BASE_PATH } = {}) {
  const config = JSON.parse(await fs.readFile(path.join(root, 'site.config.json'), 'utf8'));
  const siteOrigin = (origin || config.url).replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(siteOrigin)) throw new Error('SITE_URL 必须为网站源地址，例如 https://hgthink.cn');
  const base = normalizedBase(basePath || '');
  const href = route => `${base}${route}`;
  const absolute = route => `${siteOrigin}${href(route)}`;
  const topicName = slug => config.topics.find(topic => topic.slug === slug)?.name || slug;
  const filenames = (await fs.readdir(path.join(root, 'content/articles'))).filter(name => name.endsWith('.md')).sort();
  const articles = [];
  const slugs = new Set(); const originalUrls = new Set();
  for (const name of filenames) {
    const article = parseArticle(await fs.readFile(path.join(root, 'content/articles', name), 'utf8'), name, config.topics.map(topic => topic.slug));
    if (!article) continue;
    if (slugs.has(article.slug) || originalUrls.has(article.wechat_url)) throw new Error(`${name}: slug 或公众号原文链接重复`);
    slugs.add(article.slug); originalUrls.add(article.wechat_url);
    article.route = `/articles/${article.slug}/`;
    article.toc = [];
    const safeUrl = value => {
      if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return href(value);
      if (value.startsWith('#')) return value;
      try { const url = new URL(value); if (['https:', 'http:', 'mailto:'].includes(url.protocol)) return value; } catch {}
      return null;
    };
    const markdown = new Marked({ gfm: true, breaks: true });
    markdown.use({ renderer: {
      html({ text }) { return escape(text); },
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = `section-${article.toc.length + 1}`;
        const level = Math.max(2, depth);
        article.toc.push({ id, title: plainText(text), level });
        return `<h${level} id="${id}">${text}</h${level}>\n`;
      },
      link({ href: url, title, tokens }) {
        const safe = safeUrl(url);
        const text = this.parser.parseInline(tokens);
        if (!safe) return text;
        const external = /^https?:/.test(safe);
        return `<a href="${escape(safe)}"${title ? ` title="${escape(title)}"` : ''}${external ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
      },
      image({ href: url, title, text }) {
        if (!/^\/images\/[a-zA-Z0-9/_.,-]+$/.test(url)) throw new Error(`${name}: 配图需保存到 public/images，再用 /images/... 引用`);
        return `<img src="${escape(href(url))}" alt="${escape(text || '文章配图')}"${title ? ` title="${escape(title)}"` : ''} loading="lazy" decoding="async">`;
      }
    } });
    article.html = markdown.parse(article.body).replace(/<table>/g, '<div class="table-scroll" role="region" aria-label="文章表格" tabindex="0"><table>').replace(/<\/table>/g, '</table></div>');
    article.text = plainText(article.html);
    article.minutes = Math.max(1, Math.ceil(article.text.length / 450));
    articles.push(article);
  }
  articles.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at) || a.slug.localeCompare(b.slug));
  if (!articles.length) throw new Error('没有可发布的文章');
  // 只清理本次构建拥有的输出目录；不操作原稿或其他网站目录。
  const resolvedRoot = path.resolve(root); const resolvedOut = path.resolve(outDir);
  if (!resolvedOut.startsWith(`${resolvedRoot}${path.sep}`) || resolvedOut === resolvedRoot) throw new Error('输出目录必须位于站点项目内部');
  await fs.rm(resolvedOut, { recursive: true, force: true });
  await fs.mkdir(resolvedOut, { recursive: true });
  await fs.cp(path.join(root, 'public'), resolvedOut, { recursive: true });
  const pages = [];
  async function write(route, content) {
    const filename = route.endsWith('/') ? `${route}index.html` : route;
    const dest = path.join(resolvedOut, filename.replace(/^\//, ''));
    await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.writeFile(dest, content);
    if (route.endsWith('/')) pages.push(route);
  }
  const link = (route, text, cls = '') => `<a href="${escape(href(route))}"${cls ? ` class="${cls}"` : ''}>${text}</a>`;
  const wechatFollow = () => config.wechatQr
    ? `<img class="qr" src="${escape(href(config.wechatQr))}" alt="关注禾光思想公众号的二维码" width="180" height="180" loading="lazy"><p>用微信扫码，或保存二维码后在微信识别。</p>`
    : `<p>在微信里搜索公众号<strong>「${escape(config.wechatName)}」</strong>，继续阅读、分享与交流。</p>`;
  if (config.wechatQr && !/^\/images\/[a-zA-Z0-9/_.,-]+$/.test(config.wechatQr)) throw new Error('wechatQr 请填写 /images/... 路径');
  const nav = current => `<header class="site-header"><div class="wrap header-inner"><a class="brand" href="${href('/')}" aria-label="禾光思想首页"><span class="monogram" aria-hidden="true">禾</span><span><strong>${escape(config.name)}</strong><small>HEGUANG · READING & RESEARCH</small></span></a><nav class="nav" aria-label="主导航">${[['/start/', '开始阅读'], ['/articles/', '文章'], ['/clarity/', '清醒空间'], ['/about/', '关于禾光']].map(([route, text]) => `<a href="${href(route)}"${current === route ? ' aria-current="page"' : ''}>${text}</a>`).join('')}</nav></div></header>`;
  const layout = ({ route, title, description = config.description, content, article, noindex = false }) => {
    const pageTitle = route === '/' ? `${config.name} · 阅读与研究` : `${title} · ${config.name}`;
    const schema = article ? {
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: article.title, description: article.description,
      datePublished: article.published_at, dateModified: article.updated_at || article.published_at,
      author: { '@type': 'Organization', name: article.author }, publisher: { '@type': 'Organization', name: config.name },
      mainEntityOfPage: absolute(route), url: absolute(route), articleSection: topicName(article.topic), inLanguage: 'zh-CN', isBasedOn: article.wechat_url
    } : { '@context': 'https://schema.org', '@type': 'WebSite', name: config.name, url: absolute('/'), description: config.description, inLanguage: 'zh-CN' };
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(pageTitle)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${noindex ? 'noindex,nofollow' : 'index,follow'}"><link rel="canonical" href="${escape(absolute(route))}"><meta property="og:type" content="${article ? 'article' : 'website'}"><meta property="og:title" content="${escape(pageTitle)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(absolute(route))}"><meta property="og:site_name" content="${escape(config.name)}"><meta property="og:locale" content="zh_CN"><meta name="theme-color" content="#203f32"><link rel="icon" href="${href('/assets/favicon.svg')}" type="image/svg+xml"><link rel="alternate" type="application/rss+xml" title="禾光思想 RSS" href="${href('/feed.xml')}"><link rel="stylesheet" href="${href('/assets/styles.css')}"><link rel="stylesheet" href="${href('/assets/site.css')}"><script type="application/ld+json">${json(schema)}</script><script src="${href('/assets/site.js')}" defer></script></head><body><a class="skip" href="#main">跳到正文</a>${nav(route)}${content}<footer class="wrap footer"><span>禾光思想 · 阅读与研究</span><div>${link('/articles/', '文章归档')}　${link('/about/#wechat', '微信公众号')}　${link('/feed.xml', 'RSS 订阅')}</div></footer></body></html>`;
  };
  const row = article => `<article class="article-row" data-topic="${article.topic}" data-slug="${article.slug}"><time datetime="${article.published_at}">${dateLabel(article.published_at).replaceAll('-', '.')}</time><div><span class="topic-label">${escape(topicName(article.topic))}</span><h3>${link(article.route, escape(article.title))}</h3><p>${escape(article.description)}</p><span class="read-time">约 ${article.minutes} 分钟</span></div><span class="arrow" aria-hidden="true">→</span></article>`;
  const readingPath = `<div class="sidebox"><p class="eyebrow">START HERE</p><h3>第一次来到这里</h3><ol class="path"><li><span>01</span>${link('/start/', '找到适合你的阅读路径')}</li><li><span>02</span>${link('/articles/seeing-your-judgment/', '看见判断是怎样形成的')}</li><li><span>03</span>${link('/clarity/', '把一个决定放进清醒空间')}</li></ol></div>`;
  const list = (items, initial = 'all') => `<div class="article-search" data-initial-topic="${initial}" data-search-url="${href('/search-index.json')}"><label class="search-label" for="search">搜索标题、摘要与全文</label><input class="search" id="search" type="search" placeholder="搜索：判断、压力、AI、重复……" autocomplete="off"><div class="filterbar"><div class="tabs" aria-label="按主题筛选"><button type="button" aria-pressed="${initial === 'all'}" data-filter="all">全部</button>${config.topics.map(topic => `<button type="button" aria-pressed="${initial === topic.slug}" data-filter="${topic.slug}">${escape(topic.name)}</button>`).join('')}</div></div><div id="article-list">${items.map(row).join('')}</div><p class="empty" id="empty" hidden>没有匹配的文章。可以缩短关键词，或切换到「全部」。</p><p class="result-info" id="result-info" role="status" aria-live="polite">${items.length} 篇文章 · 最新发布在前</p><noscript><p class="result-info">可以直接阅读下面的文章，也可以通过主题入口浏览。</p></noscript></div>`;
  const topicCards = config.topics.filter(topic => topic.slug !== 'clarity').map((topic, i) => `<article class="topic"><span class="num">0${i + 1} / ${topic.english}</span><h3>${link(`/topics/${topic.slug}/`, escape(topic.name))}</h3><p>${escape(topic.question)}</p>${link(`/topics/${topic.slug}/`, `阅读这个主题　→ <small>（${articles.filter(article => article.topic === topic.slug).length} 篇）</small>`)}</article>`).join('');
  const featured = articles.find(article => article.slug === config.featured) || articles[0];
  const practice = `<div class="practice"><label for="decision"><span class="index">01</span>用一句话，写下那个决定</label><textarea id="decision" placeholder="我要不要……？"></textarea><p style="font-size:13px;margin:0 0 15px"><span class="index">02</span>分开事实、判断和恐惧</p><div class="fields">${[['facts', '事实', '已经发生了什么'], ['judgment', '判断', '我认为这意味着什么'], ['fear', '恐惧', '我害怕失去什么']].map(([id, label, hint]) => `<div><label for="${id}">${label}</label><textarea id="${id}" placeholder="${hint}"></textarea></div>`).join('')}</div><details><summary><span class="index">03</span>问自己四个问题</summary><ol><li>我是在等待更多信息，还是在等待一个不会痛的答案？</li><li>如果今天必须做决定，我最不想面对的后果是什么？</li><li>这个决定里，我最想保护的是什么？</li><li>如果不考虑「看起来正确」，我最诚实的判断是什么？</li></ol></details><div class="practice-actions"><button type="button" class="solid" id="download-notes">下载我的清醒笔记</button><button type="button" class="plain-button" id="clear-notes">清空</button></div><p class="result-info" id="notes-status" role="status" aria-live="polite"></p><small>文字仅留在当前页面，不上传。刷新或关闭后不保存；需要保留时，可下载到自己的设备。</small></div>`;
  const home = `<main class="wrap" id="main"><section class="hero"><div><p class="eyebrow">创始人 · 高压决策 · 自我观察</p><h1>在关键时刻，<br>恢复判断的清晰度。</h1><p class="lead">研究人在压力与不确定中，如何形成判断。<br>把持续写下的思考，整理成可以反复返回的阅读路径。</p><div class="actions">${link('/start/', '从这里开始　→', 'solid')}${link('/articles/', '浏览文章　↗')}</div></div><aside class="hero-note"><span class="number">A SPACE FOR CLARITY</span><h2>先看见自己，<br>再看清问题。</h2><p>有些决定，需要更多信息。<br>有些决定，需要一个安静的空间。</p>${link('/clarity/', '进入清醒空间　→')}</aside></section><section class="feature" aria-label="精选文章"><div><p class="eyebrow">本期精选 / 01</p><div class="feature-mark" aria-hidden="true">择</div></div><div><p class="feature-meta">${escape(topicName(featured.topic))} · ${dateLabel(featured.published_at).replaceAll('-', '.')}</p><h2 class="feature-title">${link(featured.route, escape(featured.title))}</h2><p class="feature-desc">${escape(featured.description)}</p></div><div class="feature-aside"><p>选择之前，先看清约束。<br>持续阅读，持续校准。</p>${link(featured.route, '阅读全文　→')}</div></section><section class="section" id="topics"><div class="section-head"><div><p class="eyebrow">READ BY QUESTION</p><h2>沿着一个问题，继续读。</h2></div><p>比时间顺序更重要的，<br>是你此刻正在面对什么。</p></div><div class="topics">${topicCards}</div></section><section class="section library" id="articles"><div><div class="section-head"><div><p class="eyebrow">THE JOURNAL</p><h2>文章与思考</h2></div><p>${link('/articles/', '完整文章归档　↗')}</p></div>${list(articles)}</div><aside>${readingPath}<div class="sidebox"><p class="eyebrow">A SMALL PRACTICE</p><h3>先分开这三件事</h3><p>事实：已经发生了什么。<br>判断：我认为这意味着什么。<br>恐惧：我害怕失去什么。</p>${link('/clarity/', '开始一次自我观察　→')}</div><div class="sidebox"><p class="eyebrow">KEEP READING</p><h3>在微信里继续相遇</h3>${wechatFollow()}</div></aside></section><section class="section clarity"><div><p class="eyebrow">THE CLARITY SPACE</p><h2>在重要决定前，<br>先回到自己。</h2><p>当你面对一个迟迟没有推进的决定，给自己几分钟，把混在一起的事情分开。</p>${link('/clarity/', '进入清醒空间　→', 'solid')}</div><div><p class="clarity-quote">清醒不是没有恐惧。<br>清醒是你知道恐惧在哪里，<br>也知道自己仍然需要做出选择。</p></div></section><section class="section about"><div><p class="eyebrow">ABOUT HEGUANG</p><h2>长期研究，持续表达。</h2><p>禾光思想关注创始人、高压决策与自我观察。我们研究一个人如何形成判断，个人的长板与盲区又如何影响组织。</p>${link('/about/', '更多关于禾光　→')}</div><div class="follow"><p class="eyebrow">WECHAT · 禾光思想</p><strong>把阅读带回日常。</strong>${wechatFollow()}</div></section></main>`;
  await write('/', layout({ route: '/', title: config.name, content: home }));
  await write('/articles/', layout({ route: '/articles/', title: '文章归档', content: `<main class="wrap" id="main"><section class="section"><div class="section-head"><div><p class="eyebrow">THE JOURNAL</p><h1 class="page-title">文章归档</h1></div><p>${articles.length} 篇原创文章</p></div>${list(articles)}</section></main>` }));
  for (const topic of config.topics) {
    const items = articles.filter(article => article.topic === topic.slug);
    await write(`/topics/${topic.slug}/`, layout({ route: `/topics/${topic.slug}/`, title: topic.name, description: topic.question, content: `<main class="wrap" id="main"><section class="section narrow-list"><p class="eyebrow">${topic.english}</p><h1 class="page-title">${escape(topic.name)}</h1><p class="page-intro">${escape(topic.question)}</p><div>${items.length ? items.map(row).join('') : '<p class="empty">这个主题的文章正在整理。可以先浏览其他文章。</p>'}</div><p>${link('/articles/', '浏览全部文章　→')}</p></section></main>` }));
  }
  for (const article of articles) {
    const related = articles.filter(item => item.slug !== article.slug).sort((a, b) => Number(b.topic === article.topic) - Number(a.topic === article.topic)).slice(0, 3);
    const content = `<main class="reading" id="main"><nav class="breadcrumb" aria-label="当前位置">${link('/articles/', '文章')} / ${link(`/topics/${article.topic}/`, escape(topicName(article.topic)))}</nav><h1>${escape(article.title)}</h1><div class="meta">${escape(article.author)} · <time datetime="${article.published_at}">${dateLabel(article.published_at)}</time> · ${escape(topicName(article.topic))} · 约 ${article.minutes} 分钟${article.updated_at ? `<br>网页修订：<time datetime="${article.updated_at}">${dateLabel(article.updated_at)}</time>` : ''}</div><p class="abstract">${escape(article.description)}</p>${article.toc.length ? `<details class="toc"><summary>文章目录</summary><ul>${article.toc.map(item => `<li class="level-${item.level}"><a href="#${item.id}">${escape(item.title)}</a></li>`).join('')}</ul></details>` : ''}<article class="prose">${article.html}</article><div class="article-tags">${article.tags.map(tag => `<span>${escape(tag)}</span>`).join('')}</div><div class="endnote"><p>本文同步自微信公众号「${escape(config.wechatName)}」。</p><p><a href="${escape(article.wechat_url)}" target="_blank" rel="noopener">阅读公众号原文　↗</a></p>${wechatFollow()}<p>${link('/clarity/', '下一步：进入清醒空间　→')}</p></div><section class="related" aria-label="继续阅读"><p class="eyebrow">KEEP READING</p><h2>继续阅读</h2>${related.map(row).join('')}</section></main>`;
    await write(article.route, layout({ route: article.route, title: article.title, description: article.description, content, article }));
  }
  const picks = ['decision-system-ai', 'seeing-your-judgment', 'founders-five-practices'].map(slug => articles.find(article => article.slug === slug)).filter(Boolean);
  await write('/start/', layout({ route: '/start/', title: '第一次来到禾光', content: `<main class="reading" id="main"><p class="eyebrow">START HERE</p><h1>第一次来到禾光</h1><p class="abstract">可以先读三篇文章，再把一个真实问题放进清醒空间。</p><div class="prose"><h2>我们在研究什么</h2><p>禾光思想研究创始人、高压决策与自我观察。我们关注人在复杂、不确定和内部冲突中，如何恢复判断的清晰度。</p><h2>从这里开始读</h2></div>${picks.map(row).join('')}<div class="prose"><h2>当你正在面对一个重要决定</h2><p>先写下那个决定，分开事实、判断和恐惧。${link('/clarity/', '清醒空间')}为你提供一个可以独立使用的小练习。</p><h2>沿着你的问题继续读</h2><ul>${config.topics.map(topic => `<li>${link(`/topics/${topic.slug}/`, escape(topic.name))}：${escape(topic.question)}</li>`).join('')}</ul></div></main>` }));
  await write('/clarity/', layout({ route: '/clarity/', title: '清醒空间', description: '在重要决定前，用三个步骤写下决定、分开事实与判断、看清恐惧。', content: `<main class="wrap" id="main"><section class="section clarity"><div><p class="eyebrow">THE CLARITY SPACE</p><h1 class="page-title">在重要决定前，<br>先回到自己。</h1><p>当你面对一个迟迟没有推进的决定，给自己几分钟，把混在一起的事情分开。</p><p>这里帮助你整理自己的观察。重要的选择，仍然由你作出。</p>${link('/articles/clarity-space/', '阅读《清醒空间》完整文章　→')}</div>${practice}</section></main>` }));
  await write('/about/', layout({ route: '/about/', title: '关于禾光', content: `<main class="reading" id="main"><p class="eyebrow">ABOUT HEGUANG</p><h1>长期研究，持续表达。</h1><div class="prose"><p>禾光思想关注创始人、高压决策与自我观察。我们研究一个人如何形成判断，个人的长板与盲区又如何影响组织。</p><p>这里沉淀公众号的文章与阅读路径。研究框架和服务介绍，可以继续前往<a href="${escape(config.officialSite)}" target="_blank" rel="noopener">禾光思想中心官网</a>。</p><h2 id="wechat">在微信里继续相遇</h2>${wechatFollow()}<h2>持续订阅</h2><p>也可以通过 ${link('/feed.xml', 'RSS')} 在自己习惯的阅读工具里接收文章更新。</p><h2>文章与来源</h2><p>文章按公众号首次发布日期归档，网页整理目录和阅读排版，保留原文链接与原有引用说明。如有正文修订，会在文章页标明修订日期。</p></div></main>` }));
  await write('/404.html', layout({ route: '/404.html', title: '没有找到这个页面', noindex: true, content: `<main class="reading" id="main"><p class="eyebrow">404</p><h1>这个页面暂时没有找到。</h1><p>可以回到文章归档，沿着一个问题重新开始。</p>${link('/articles/', '浏览文章　→', 'solid')}</main>` }));
  await write('/search-index.json', json(articles.map(article => ({ slug: article.slug, title: article.title, description: article.description, topic: article.topic, tags: article.tags, text: article.text, url: href(article.route) }))));
  const lastPublished = articles.reduce((latest, article) => Math.max(latest, Date.parse(article.updated_at || article.published_at)), 0);
  const xml = value => escape(value);
  const sitemap = pages.map(route => {
    const article = articles.find(item => item.route === route);
    const date = article ? dateLabel(article.updated_at || article.published_at) : dateLabel(new Date(lastPublished).toISOString());
    return `<url><loc>${xml(absolute(route))}</loc><lastmod>${date}</lastmod></url>`;
  }).join('\n');
  await write('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap}</urlset>`);
  await write('/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${absolute('/sitemap.xml')}\n`);
  await write('/feed.xml', `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xml(config.name)}</title><link>${xml(absolute('/'))}</link><description>${xml(config.description)}</description><language>zh-cn</language><atom:link href="${xml(absolute('/feed.xml'))}" rel="self" type="application/rss+xml"/><lastBuildDate>${new Date(lastPublished).toUTCString()}</lastBuildDate>${articles.map(article => `<item><title>${xml(article.title)}</title><link>${xml(absolute(article.route))}</link><guid isPermaLink="true">${xml(absolute(article.route))}</guid><pubDate>${new Date(article.published_at).toUTCString()}</pubDate><description>${xml(article.description)}</description><category>${xml(topicName(article.topic))}</category></item>`).join('')}</channel></rss>`);
  await write('/.nojekyll', '');
  return { articles, pages, outDir: resolvedOut, base, origin: siteOrigin };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildSite();
  console.log(`Built ${result.articles.length} articles and ${result.pages.length} pages → ${result.outDir}`);
}
