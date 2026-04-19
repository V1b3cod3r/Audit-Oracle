import 'dotenv/config';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import briefingHandler from './api/briefing.js';
import refreshHandler from './api/briefing/refresh.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function wrapRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

function readJsonBody(req) {
  return new Promise((resolveBody) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      if (!data) return resolveBody({});
      try { resolveBody(JSON.parse(data)); } catch { resolveBody({}); }
    });
    req.on('error', () => resolveBody({}));
  });
}

const server = http.createServer(async (req, res) => {
  wrapRes(res);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/briefing') {
      return briefingHandler(req, res);
    }
    if (pathname === '/api/briefing/refresh') {
      req.body = await readJsonBody(req);
      return refreshHandler(req, res);
    }

    const relPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = resolve(PUBLIC, `.${relPath}`);
    if (!filePath.startsWith(PUBLIC)) {
      res.statusCode = 403;
      return res.end('Forbidden');
    }
    const data = await readFile(filePath);
    res.setHeader('Content-Type', MIME[extname(filePath)] || 'application/octet-stream');
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.statusCode = 404;
      return res.end('Not found');
    }
    console.error('[dev] error:', err);
    res.statusCode = 500;
    res.end('Internal error');
  }
});

const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, () => {
  console.log(`[dev] briefing running at http://localhost:${PORT}`);
  console.log('[dev] open it and tap Refresh to generate your first briefing');
});
