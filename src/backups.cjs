const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicWrite, readJSON } = require('./storage.cjs');
const KEY = /^(local|[a-f0-9]{64})$/;
const ASSET = /^[a-f0-9-]{36}\.(png|jpg|webp|webm|ogg|mp3|m4a|wav)$/;
async function exists(file) { try { return await fs.stat(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
async function privateCopy(from, to) {
  if (!(await fs.lstat(from)).isFile()) throw new Error('A library backup encountered an unsupported file.');
  await fs.copyFile(from, to); await fs.chmod(to, 0o600);
}
async function snapshotLibraries(root, { version, reason = 'manual', keys } = {}) {
  const libraries = path.join(root, 'libraries');
  const available = keys || (await fs.readdir(libraries).catch(e => { if (e.code === 'ENOENT') return []; throw e; })).filter(k => KEY.test(k));
  const selected = [];
  for (const key of available) { if (!KEY.test(key)) throw new Error('Invalid backup shelf.'); if (await exists(path.join(libraries, key, 'library.json'))) selected.push(key); }
  if (!selected.length) return null;
  const folder = path.join(root, 'backups', 'app', `${Date.now()}-${randomUUID()}`), staging = `${folder}.tmp`;
  await fs.mkdir(staging, { recursive: true, mode: 0o700 });
  try {
    for (const key of selected) {
      const source = path.join(libraries, key), target = path.join(staging, 'libraries', key);
      await fs.mkdir(target, { recursive: true, mode: 0o700 });
      await privateCopy(path.join(source, 'library.json'), path.join(target, 'library.json'));
      const assets = await fs.readdir(path.join(source, 'assets')).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
      if (assets.length) await fs.mkdir(path.join(target, 'assets'), { mode: 0o700 });
      for (const name of assets) if (ASSET.test(name)) await privateCopy(path.join(source, 'assets', name), path.join(target, 'assets', name));
    }
    const metadata = { application: 'aftertaste-snapshot', version: 1, appVersion: version, reason, createdAt: new Date().toISOString(), shelves: selected };
    await atomicWrite(path.join(staging, 'snapshot.json'), JSON.stringify(metadata, null, 2));
    await fs.rename(staging, folder);
    const result = { folder, createdAt: metadata.createdAt, reason, shelves: selected.length };
    await atomicWrite(path.join(root, 'latest-backup.json'), JSON.stringify(result));
    return result;
  } catch (e) { await fs.rm(staging, { recursive: true, force: true }); throw e; }
}
async function prepareUpdateBackup(root, version) {
  const file = path.join(root, 'app-version.json'), previous = await readJSON(file, { version: null });
  if (previous.version === version) return null;
  const snapshot = await snapshotLibraries(root, { version, reason: 'before-update' });
  await atomicWrite(file, JSON.stringify({ version, previous: previous.version, checkedAt: new Date().toISOString() }));
  return snapshot;
}
async function portableBackup(store, key) {
  const library = await store.read(key), assets = {};
  const names = new Set(library.materials.flatMap(m => [m.coverAsset, ...(m.notes || []).map(n => n.audioAsset)]).filter(Boolean));
  for (const name of names) assets[name] = (await store.asset(key, name)).toString('base64');
  return { application: 'aftertaste', version: 1, library, assets };
}
async function copyOfflineLibrary(store, key) {
  const existing = await store.read(key); if (existing.materials.length || existing.sources.length) return false;
  const source = await store.read('local');
  if (!source.materials.length && !source.sources.length) return false;
  let copied = false;
  await store.update(key, async target => {
    if (target.materials.length || target.sources.length) return;
    const names = new Set(source.materials.flatMap(m => [m.coverAsset, ...(m.notes || []).map(n => n.audioAsset)]).filter(Boolean));
    if (names.size) await fs.mkdir(path.join(store.folder(key), 'assets'), { recursive: true, mode: 0o700 });
    for (const name of names) {
      if (!ASSET.test(name)) throw new Error('Invalid library asset.');
      await privateCopy(path.join(store.folder('local'), 'assets', name), path.join(store.folder(key), 'assets', name));
    }
    Object.assign(target, structuredClone(source)); copied = true;
  });
  return copied;
}
module.exports = { snapshotLibraries, prepareUpdateBackup, portableBackup, copyOfflineLibrary };
