/* 全文与主题筛选只在浏览器运行；正文及入口由构建生成。 */
(() => {
  const library = document.querySelector('.article-search');
  if (library) {
    const input = document.getElementById('search');
    const rows = [...document.querySelectorAll('.article-row[data-slug]')];
    const tabs = [...library.querySelectorAll('[data-filter]')];
    const status = document.getElementById('result-info');
    let current = library.dataset.initialTopic;
    let fullText = new Map();
    let fullTextReady = false;
    function update() {
      const words = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      let count = 0;
      for (const row of rows) {
        const haystack = (fullText.get(row.dataset.slug) || row.textContent).toLocaleLowerCase();
        row.hidden = (current !== 'all' && row.dataset.topic !== current) || !words.every(word => haystack.includes(word));
        if (!row.hidden) count++;
      }
      tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.filter === current)));
      document.getElementById('empty').hidden = count !== 0;
      status.textContent = words.length ? `找到 ${count} 篇文章${fullTextReady ? '' : '（当前按标题与摘要查找）'}` : `${count} 篇文章 · 最新发布在前`;
    }
    tabs.forEach(tab => tab.addEventListener('click', () => { current = tab.dataset.filter; update(); }));
    input.addEventListener('input', update);
    fetch(library.dataset.searchUrl).then(response => { if (!response.ok) throw new Error('无法加载搜索索引'); return response.json(); }).then(items => {
      fullText = new Map(items.map(item => [item.slug, [item.title, item.description, ...item.tags, item.text].join(' ')]));
      fullTextReady = true; update();
    }).catch(() => { update(); });
  }
  const download = document.getElementById('download-notes');
  if (download) {
    const ids = ['decision', 'facts', 'judgment', 'fear'];
    const names = ['我的决定', '事实', '判断', '恐惧'];
    download.addEventListener('click', () => {
      if (ids.every(id => !document.getElementById(id).value.trim())) {
        document.getElementById('notes-status').textContent = '先写下你的决定或观察，再下载笔记。'; return;
      }
      const text = '# 清醒空间 · 我的笔记\n\n' + ids.map((id, index) => `## ${names[index]}\n\n${document.getElementById(id).value.trim()}\n`).join('\n') + '\n## 问自己四个问题\n\n' + [...document.querySelectorAll('.practice details li')].map(item => '- ' + item.textContent).join('\n');
      const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = '清醒空间-我的笔记.md'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      document.getElementById('notes-status').textContent = '笔记已生成，请查看浏览器下载。';
    });
    document.getElementById('clear-notes').addEventListener('click', () => {
      ids.forEach(id => { document.getElementById(id).value = ''; });
      document.getElementById('notes-status').textContent = '已清空当前页面的笔记。';
      document.getElementById('decision').focus();
    });
  }
})();
