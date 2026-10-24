// Simple static file host: drop .html files into ./pages and they show up on the index.
// Run: node server.js   (or: npm start)   Options: PORT=8080 PAGES_DIR=./pages
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const os = require('os');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const PAGES_DIR = path.resolve(process.env.PAGES_DIR || path.join(__dirname, 'pages'));
const MAX_UPLOAD = (Number(process.env.MAX_UPLOAD_MB) || 4096) * 1024 * 1024;

// ffmpeg: system binary if FFMPEG_PATH is set or one is on PATH, else the bundled ffmpeg-static one.
let FFMPEG = process.env.FFMPEG_PATH || null;
if (!FFMPEG) {
  try { FFMPEG = require('ffmpeg-static'); } catch { FFMPEG = 'ffmpeg'; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Pull <title> out of an HTML file so the list shows a readable name.
async function readTitle(file) {
  try {
    const fh = await fsp.open(file, 'r');
    try {
      const buf = Buffer.alloc(64 * 1024);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      const head = buf.toString('utf8', 0, bytesRead);
      const m = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      return m ? m[1].replace(/\s+/g, ' ').trim() : '';
    } finally {
      await fh.close();
    }
  } catch {
    return '';
  }
}

function prettyName(filename) {
  return filename
    .replace(/\.html?$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

// Recursively collect every .html file under PAGES_DIR.
async function listPages(dir = PAGES_DIR, rel = '') {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    const relPath = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      out.push(...(await listPages(abs, relPath)));
    } else if (/\.html?$/i.test(e.name)) {
      const st = await fsp.stat(abs);
      const title = await readTitle(abs);
      out.push({
        path: relPath,
        url: '/pages/' + relPath.split('/').map(encodeURIComponent).join('/'),
        title: title || prettyName(e.name),
        size: st.size,
        modified: st.mtime,
      });
    }
  }
  out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  return out;
}

function indexHtml(pages) {
  const rows = pages.length
    ? pages
        .map(
          (p) => `<li class="item">
  <a class="link" href="${p.url}">
    <span class="title">${esc(p.title)}</span>
    <span class="file">${esc(p.path)}</span>
  </a>
  <span class="meta">${fmtSize(p.size)} &middot; ${p.modified.toISOString().slice(0, 10)}</span>
</li>`
        )
        .join('\n')
    : `<li class="empty">No pages yet. Drop <code>.html</code> files into <code>${esc(PAGES_DIR)}</code> and refresh.</li>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hosted pages</title>
<style>
  :root { color-scheme: light dark; --fg: #1f1e1d; --muted: #6d6b67; --line: rgba(0,0,0,.12); --bg: #f9f9f7; --card: #fff; --accent: #185fa5; }
  @media (prefers-color-scheme: dark) { :root { --fg: #f0efec; --muted: #a5a49a; --line: rgba(255,255,255,.14); --bg: #151515; --card: #20201f; --accent: #85b7eb; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 16px; font: 15px/1.5 system-ui, "Segoe UI", Roboto, sans-serif; color: var(--fg); background: var(--bg); }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 600; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; font-size: 13px; }
  .search { width: 100%; height: 38px; padding: 0 12px; margin-bottom: 14px; font: inherit; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--fg); }
  ul { list-style: none; padding: 0; margin: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--card); overflow: hidden; }
  .item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--line); }
  .item:first-child { border-top: 0; }
  .item:hover { background: rgba(127,127,127,.06); }
  .link { display: flex; flex-direction: column; min-width: 0; text-decoration: none; color: inherit; flex: 1; }
  .title { font-weight: 500; color: var(--accent); }
  .file { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .empty { padding: 24px 16px; color: var(--muted); text-align: center; }
  code { font-size: 12px; background: rgba(127,127,127,.12); padding: 1px 5px; border-radius: 4px; }
  footer { margin-top: 18px; font-size: 12px; color: var(--muted); }
  footer a { color: inherit; }
</style>
</head>
<body>
<main>
  <h1>Hosted pages</h1>
  <p class="sub">${pages.length} page${pages.length === 1 ? '' : 's'} served from <code>${esc(PAGES_DIR)}</code></p>
  <input class="search" type="search" placeholder="Filter pages" aria-label="Filter pages" oninput="for(const li of document.querySelectorAll('.item'))li.hidden=!li.textContent.toLowerCase().includes(this.value.toLowerCase())">
  <ul>
${rows}
  </ul>
  <footer>JSON list at <a href="/api/pages">/api/pages</a>. Add or remove files in the folder and reload; no restart needed.</footer>
</main>
</body>
</html>`;
}

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...extra });
  res.end(body);
}

async function serveFile(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/pages\/?/, ''));
  const abs = path.resolve(PAGES_DIR, rel);

  // Block path traversal: the resolved path must stay inside PAGES_DIR.
  if (abs !== PAGES_DIR && !abs.startsWith(PAGES_DIR + path.sep)) {
    return send(res, 403, 'Forbidden');
  }

  let st;
  try {
    st = await fsp.stat(abs);
  } catch {
    return send(res, 404, 'Not found');
  }

  if (st.isDirectory()) {
    // Serve index.html inside a subfolder if present, else 404.
    const idx = path.join(abs, 'index.html');
    try {
      st = await fsp.stat(idx);
      return streamFile(req, res, idx, st);
    } catch {
      return send(res, 404, 'Not found');
    }
  }
  return streamFile(req, res, abs, st);
}

function streamFile(req, res, file, st) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const etag = `"${st.size}-${st.mtimeMs}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304);
    return res.end();
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': st.size,
    'Last-Modified': st.mtime.toUTCString(),
    ETag: etag,
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

// POST /api/audio  (body: the raw media file)  ->  16 kHz mono 16-bit WAV.
// Writes the upload to a temp file (ffmpeg needs to seek in MP4/MOV), converts, streams the WAV back.
async function extractAudio(req, res) {
  const tmp = path.join(os.tmpdir(), `vt-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  const cleanup = () => fsp.unlink(tmp).catch(() => {});
  try {
    await new Promise((resolve, reject) => {
      let size = 0;
      const out = fs.createWriteStream(tmp);
      req.on('data', (c) => { size += c.length; if (size > MAX_UPLOAD) { req.destroy(); reject(new Error('too-large')); } });
      req.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      req.pipe(out);
    });
  } catch (e) {
    cleanup();
    return send(res, e.message === 'too-large' ? 413 : 400, e.message === 'too-large' ? `File is larger than ${MAX_UPLOAD / 1048576} MB` : 'Upload failed');
  }

  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', tmp, '-vn', '-sn', '-dn', '-map', '0:a:0?', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1'];
  let ff;
  try {
    ff = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    cleanup();
    return send(res, 500, 'ffmpeg is not available on the server');
  }
  let err = '';
  let started = false;
  ff.stderr.on('data', (d) => { err += d; });
  ff.stdout.once('data', () => {
    started = true;
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' });
  });
  ff.stdout.pipe(res, { end: false });
  ff.on('error', (e) => { cleanup(); if (!res.headersSent) send(res, 500, 'ffmpeg failed to start: ' + e.message); });
  ff.on('close', () => {
    cleanup();
    if (started || res.headersSent) return res.end();
    const m = err.trim().split('\n').pop() || '';
    const msg = /does not contain any stream|Stream map .* matches no streams|no audio/i.test(err)
      ? 'This file has no audio track.'
      : /Invalid data found|moov atom not found|could not find codec parameters/i.test(err)
        ? 'This file is not a readable media file, or it is damaged.'
        : `ffmpeg could not read the audio${m ? ': ' + m : ''}`;
    send(res, 422, msg);
  });
  req.on('close', () => { if (!res.writableEnded) ff.kill(); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (req.method === 'POST' && p === '/api/audio') return extractAudio(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    if (p === '/api/audio') return send(res, 200, JSON.stringify({ ffmpeg: FFMPEG, maxUploadMB: MAX_UPLOAD / 1048576 }), 'application/json; charset=utf-8');
    if (p === '/' || p === '/index.html') return send(res, 200, indexHtml(await listPages()), 'text/html; charset=utf-8');
    if (p === '/api/pages') return send(res, 200, JSON.stringify(await listPages(), null, 2), 'application/json; charset=utf-8');
    if (p === '/healthz') return send(res, 200, 'ok');
    if (p.startsWith('/pages/')) return serveFile(req, res, p);
    return send(res, 404, 'Not found');
  } catch (err) {
    console.error(err);
    return send(res, 500, 'Server error');
  }
});

fs.mkdirSync(PAGES_DIR, { recursive: true });
server.listen(PORT, () => {
  console.log(`Serving ${PAGES_DIR}`);
  console.log(`Open http://localhost:${PORT}/`);
});
