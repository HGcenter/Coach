import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildSite, parseArticle, projectRoot } from '../scripts/build.mjs';
import { checkOutput } from '../scripts/check.mjs';

test('新增文章自动更新首页、栏目、全文搜索、RSS 和 sitemap；草稿不发布', async () => {
  const root = await fs.mkdtemp(path.join(projectRoot, '.test-'));
  try {
    for (const folder of ['public', 'content']) await fs.cp(path.join(projectRoot, folder), path.join(root, folder), { recursive: true });
    await fs.copyFile(path.join(projectRoot, 'site.config.json'), path.join(root, 'site.config.json'));
    const baseline = await buildSite({ root, basePath: '', origin: 'https://hgthink.cn' });
    const addition = `---\ntitle: 自动归档测试文章\nslug: pipeline-fixture\npublished_at: '2026-10-10T08:00:00+08:00'\ntopic: decision-system\ndescription: 检查一次提交更新所有入口。\nwechat_url: https://mp.weixin.qq.com/s/pipeline-fixture\nstatus: published\n---\n\n## 反馈与选择\n\n正文独有关键词：构建验证灯塔。\n\n| 事实 | 判断 |\n| --- | --- |\n| 看见信号 | 决定下一步 |\n`;
    await fs.writeFile(path.join(root, 'content/articles/pipeline-fixture.md'), addition);
    await fs.writeFile(path.join(root, 'content/articles/draft-fixture.md'), '---\nstatus: draft\n---\n绝不能公开的草稿内容。');
    const next = await buildSite({ root, basePath: '', origin: 'https://hgthink.cn' });
    assert.equal(next.articles.length, baseline.articles.length + 1);
    for (const name of ['index.html', 'articles/index.html', 'topics/decision-system/index.html', 'search-index.json', 'feed.xml', 'sitemap.xml']) {
      const content = await fs.readFile(path.join(next.outDir, name), 'utf8');
      assert.ok(content.includes('pipeline-fixture'), `${name} 应新增入口`);
      assert.ok(!content.includes('绝不能公开') && !content.includes('draft-fixture'), `${name} 不得发布草稿`);
    }
    const page = await fs.readFile(path.join(next.outDir, 'articles/pipeline-fixture/index.html'), 'utf8');
    assert.match(page, /构建验证灯塔/); assert.match(page, /<table>/); assert.match(page, /section-1/);
    const items = JSON.parse(await fs.readFile(path.join(next.outDir, 'search-index.json'), 'utf8'));
    assert.equal(items[0].slug, 'pipeline-fixture');
    assert.ok(items[0].text.includes('构建验证灯塔'));
    await checkOutput(next.outDir);
    await fs.unlink(path.join(root, 'content/articles/pipeline-fixture.md'));
    const afterDelete = await buildSite({ root, basePath: '', origin: 'https://hgthink.cn' });
    await assert.rejects(fs.access(path.join(afterDelete.outDir, 'articles/pipeline-fixture/index.html')));
    assert.equal(afterDelete.articles.length, baseline.articles.length);
    const subpath = await buildSite({ root, basePath: '/hgthink-reading', origin: 'https://example.github.io' });
    await checkOutput(subpath.outDir);
    const index = await fs.readFile(path.join(subpath.outDir, 'index.html'), 'utf8');
    assert.match(index, /href="\/hgthink-reading\/articles\//);
  } finally {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(projectRoot) + path.sep + '.test-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});

test('无效日期、重复元数据、未知栏目和非公众号链接阻止发布', () => {
  const valid = `---\ntitle: 标题\nslug: fixture\npublished_at: '2026-10-10'\ntopic: decision-system\ndescription: 摘要\nwechat_url: https://mp.weixin.qq.com/s/fixture\nstatus: published\n---\n正文`;
  for (const changed of [valid.replace('2026-10-10', '2026-02-30'), valid.replace('topic: decision-system', 'topic: wrong'), valid.replace('mp.weixin.qq.com', 'wrong.example'), valid.replace('slug: fixture', 'slug: ../../escape'), valid.replace('title: 标题', 'title: 标题\ntitle: 重复')]) {
    assert.throws(() => parseArticle(changed, 'fixture.md', ['decision-system']));
  }
});
