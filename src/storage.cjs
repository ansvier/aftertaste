const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, data, { mode: 0o600, flag: 'wx' });
    await fs.rename(temp, file);
    await fs.chmod(file, 0o600);
  } finally { await fs.rm(temp, { force: true }); }
}
async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return structuredClone(fallback); throw new Error('A local data file could not be read. Restore a backup before continuing.'); }
}
const emptyLibrary = () => ({ version: 1, materials: [], sources: [], recommendations: [], dismissed: [], contextSummary: '', updatedAt: null });
const accountKey = (account) => account ? createHash('sha256').update(`${account.client_id}\0${account.subject}`).digest('hex') : 'local';

class LibraryStore {
  constructor(root) { this.root = root; this.queue = Promise.resolve(); }
  folder(key) {
    if (!/^(local|[a-f0-9]{64})$/.test(key)) throw new Error('Invalid local library.');
    return path.join(this.root, 'libraries', key);
  }
  async read(key) { return readJSON(path.join(this.folder(key), 'library.json'), emptyLibrary()); }
  update(key, mutate) {
    const run = this.queue.then(async () => {
      const data = await this.read(key);
      await mutate(data);
      data.updatedAt = new Date().toISOString();
      await atomicWrite(path.join(this.folder(key), 'library.json'), JSON.stringify(data, null, 2));
      return data;
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async saveAsset(key, bytes, mime) {
    const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav' };
    mime = String(mime).split(';')[0];
    const ext = extensions[mime];
    if (!ext || !(bytes instanceof Uint8Array) || !bytes.length || bytes.length > (mime.startsWith('image/') ? 8 : 20) * 1024 * 1024) throw new Error('Choose an image up to 8 MB or audio up to 20 MB.');
    const name = `${randomUUID()}.${ext}`;
    await atomicWrite(path.join(this.folder(key), 'assets', name), bytes);
    return name;
  }
  async asset(key, name) {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp|webm|ogg|mp3|m4a|wav)$/.test(name)) throw new Error('Asset not found.');
    return fs.readFile(path.join(this.folder(key), 'assets', name));
  }
}
module.exports = { atomicWrite, readJSON, emptyLibrary, accountKey, LibraryStore };
