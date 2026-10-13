import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './build.mjs';

export async function checkOutput(outDir = path.join(projectRoot, 'dist')) {
  const home = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  const siteUrl = new URL(home.match(/<link rel="canonical" href="([^"]+)"/)[1]);
  const base = siteUrl.pathname.replace(/\/$/, '');
  const issues = [];
  async function walk(directory) {
    let files = [];
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, item.name);
      files.push(...(item.isDirectory() ? await walk(filename) : [filename]));
    }
    return files;
  }
  const files = await walk(outDir);
  const htmlFiles = files.filter(filename => filename.endsWith('.html'));
  const resolveLocal = url => {
    if (url.origin !== siteUrl.origin) return null;
    if (base && url.pathname !== base && !url.pathname.startsWith(base + '/')) throw new Error(`链接漏掉了站点子路径：${url.pathname}`);
    const rel = decodeURIComponent(url.pathname.slice(base.length));
    const normalized = rel.endsWith('/') ? rel + 'index.html' : rel;
    return path.join(outDir, normalized.replace(/^\//, ''));
  };
  for (const filename of htmlFiles) {
    const html = await fs.readFile(filename, 'utf8');
    const label = path.relative(outDir, filename);
    try {
      assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, '每页应只有一个 H1');
      assert.match(html, /<meta name="description" content="[^"]+"/);
      assert.match(html, /<link rel="canonical" href="https?:\/\//);
      if (label !== '404.html') assert.doesNotMatch(html, /content="noindex/);
      const canonical = new URL(html.match(/<link rel="canonical" href="([^"]+)"/)[1]);
      for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const value = match[1].replaceAll('&amp;', '&');
        if (/^(mailto:|data:)/.test(value)) continue;
        const url = new URL(value, canonical);
        const target = resolveLocal(url);
        if (!target) continue;
        await fs.access(target);
        if (url.hash && target.endsWith('.html')) {
          const dest = await fs.readFile(target, 'utf8');
          assert.ok(dest.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `无效页内入口：${value}`);
        }
      }
      for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(match[1]);
    } catch (error) { issues.push(`${label}: ${error.message}`); }
  }
  const search = JSON.parse(await fs.readFile(path.join(outDir, 'search-index.json'), 'utf8'));
  assert.ok(search.length > 0);
  assert.equal(new Set(search.map(article => article.slug)).size, search.length);
  const sitemap = await fs.readFile(path.join(outDir, 'sitemap.xml'), 'utf8');
  const rss = await fs.readFile(path.join(outDir, 'feed.xml'), 'utf8');
  for (const article of search) {
    assert.ok(article.text.length > 0);
    const url = new URL(article.url, siteUrl).href;
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `站点地图缺少 ${article.slug}`);
    assert.ok(rss.includes(`<link>${url}</link>`), `RSS 缺少 ${article.slug}`);
  }
  assert.equal((rss.match(/<item>/g) || []).length, search.length);
  assert.equal(issues.length, 0, issues.join('\n'));
  return { pages: htmlFiles.length, articles: search.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkOutput(); console.log(`Checked ${result.pages} HTML pages, all local links/images, ${result.articles} search/RSS/sitemap entries.`);
}
