import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildSite, projectRoot } from './build.mjs';
const { outDir } = await buildSite();
const port = Number(process.env.PORT || 4180);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  let filename;
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const requested = decodeURIComponent(url.pathname);
    filename = path.resolve(outDir, '.' + requested);
    if (filename !== outDir && !filename.startsWith(outDir + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    const stat = await fs.stat(filename);
    if (stat.isDirectory()) {
      if (!requested.endsWith('/')) { res.writeHead(301, { Location: requested + '/' + url.search }); res.end(); return; }
      filename = path.join(filename, 'index.html');
    }
    const body = await fs.readFile(filename);
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }); res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' }); res.end(await fs.readFile(path.join(outDir, '404.html')));
  }
}).listen(port, '127.0.0.1', () => console.log(`禾光思想第一版： http://127.0.0.1:${port}/\n项目：${projectRoot}\n修改文章后重新运行构建；浏览器刷新页面。`));
