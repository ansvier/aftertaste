const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { atomicWrite } = require('./storage.cjs');
const { catalogCoverURL } = require('../renderer/library-tools.js');
const { coverAlternatives } = require('./catalog.cjs');
const MAX_BYTES = 8 * 1024 * 1024;
const HEADERS = { 'User-Agent': 'Aftertaste/0.3 (https://github.com/ansvier/aftertaste)', Accept: 'image/jpeg,image/png,image/webp' };

function imageMime(bytes) {
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new Error('The cover is not a supported image.');
}
function redirectAllowed(value) {
  if (catalogCoverURL(value)) return true;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname === 'archive.org' && /^\/download\/[a-z]_covers_\d+\/[a-z]_covers_[\d_]+\.zip\/\d+-(?:S|M|L)\.jpg$/.test(u.pathname);
  } catch { return false; }
}
async function download(url, fetcher, blocked) {
  for (let hop = 0; hop < 4; hop++) {
    if (!redirectAllowed(url)) break;
    const target = new URL(url), host = target.hostname;
    if ((blocked.get(host) || 0) > Date.now()) throw Object.assign(new Error('The cover provider is temporarily unavailable.'), { limitedHost: host });
    if (host === 'covers.openlibrary.org') { target.searchParams.set('default', 'false'); url = target.href; }
    const response = await fetcher(url, { headers: HEADERS, redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (response.status === 429) {
      const retry = response.headers.get('retry-after');
      const delay = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
      blocked.set(host, Date.now() + Math.max(60000, Number.isFinite(delay) ? delay : 60000));
      await response.body?.cancel(); throw Object.assign(new Error('The cover provider is temporarily unavailable.'), { limitedHost: host });
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) break;
      url = new URL(location, url).href; continue;
    }
    if (!response.ok || !/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type') || '') || Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); break; }
    const reader = response.body?.getReader(); if (!reader) break;
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > MAX_BYTES) throw new Error('The cover is too large.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = Buffer.concat(chunks), mime = imageMime(bytes);
    return { bytes, mime };
  }
  throw new Error('The cover could not be loaded.');
}

class CoverCache {
  constructor(root, fetcher = fetch) { this.folder = path.join(root, 'cover-cache'); this.fetcher = fetcher; this.pending = new Map(); this.blocked = new Map(); }
  get(url, sourceUrl = '') {
    url = catalogCoverURL(url);
    if (!url) return Promise.reject(new Error('This cover provider is not supported.'));
    sourceUrl = typeof sourceUrl === 'string' ? sourceUrl.slice(0, 2000) : '';
    const key = createHash('sha256').update(`${url}\0${sourceUrl}`).digest('hex');
    if (this.pending.has(key)) return this.pending.get(key);
    const task = this.load(key, url, sourceUrl).finally(() => this.pending.delete(key));
    this.pending.set(key, task); return task;
  }
  async load(key, url, sourceUrl) {
    const file = path.join(this.folder, `${key}.img`);
    try { const info = await fs.stat(file); if (info.size <= MAX_BYTES) { const bytes = await fs.readFile(file); return { bytes, mime: imageMime(bytes) }; } } catch {}
    let image;
    try { image = await download(url, this.fetcher, this.blocked); } catch (e) { if (e.limitedHost === new URL(url).hostname) throw e; }
    if (!image && new URL(url).hostname === 'covers.openlibrary.org') {
      const alternatives = await coverAlternatives(sourceUrl, this.fetcher).catch(() => []);
      for (const candidate of alternatives) {
        if (candidate.split('?')[0] === url.split('?')[0]) continue;
        try { image = await download(candidate, this.fetcher, this.blocked); break; } catch (e) { if (e.limitedHost === new URL(candidate).hostname) break; }
      }
    }
    if (!image) throw new Error('The cover could not be loaded.');
    await atomicWrite(file, image.bytes); await this.prune().catch(() => {}); return image;
  }
  async prune() {
    const entries = [];
    for (const name of await fs.readdir(this.folder)) {
      if (!/^[a-f0-9]{64}\.img$/.test(name)) continue;
      const file = path.join(this.folder, name), info = await fs.stat(file);
      if (info.isFile()) entries.push({ file, size: info.size, time: info.mtimeMs });
    }
    entries.sort((a, b) => a.time - b.time); let size = entries.reduce((n, e) => n + e.size, 0);
    while (entries.length > 128 || size > 96 * 1024 * 1024) { const entry = entries.shift(); size -= entry.size; await fs.unlink(entry.file); }
  }
}
module.exports = { CoverCache, imageMime };
