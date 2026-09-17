// 本地静态服务器：禁用缓存，供浏览器验证用
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:\\CodeProj\\ds_test2';
const PORT = 8137;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.yml': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let p = path.normalize(path.join(ROOT, urlPath));
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  if (urlPath.endsWith('/')) p = path.join(p, 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + urlPath); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, max-age=0'
    });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log('no-cache server on http://127.0.0.1:' + PORT));
