const electron = require('electron');
const { app, BrowserWindow, ipcMain, protocol, session, shell, dialog, Menu, net } = electron;
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { LibraryStore } = require('./storage.cjs');
const { material, text, httpsURL, fingerprint } = require('./validation.cjs');
const { parseImport } = require('./import.cjs');
const { AuthManager } = require('./auth.cjs');
const { search } = require('./catalog.cjs');
const { models, recommend } = require('./inference.cjs');

app.setName('Aftertaste');
protocol.registerSchemesAsPrivileged([{ scheme: 'aftertaste', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); } else {
  let window, auth, store, job, imports = [], importedBackup = null;
  const root = path.join(app.getPath('userData'), 'private');
  const renderer = path.join(__dirname, '..', 'renderer');
  const APP_URL = 'aftertaste://app/index.html';
  const notify = payload => { if (window && !window.isDestroyed()) window.webContents.send('aftertaste:update', payload || {}); };
  const trusted = frame => frame && frame.url === APP_URL && frame === window?.webContents.mainFrame;
  const assertIdle = () => { if (job) throw new Error('Wait for the selection to finish or cancel it first.'); };
  const mime = name => ({ html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', ttf: 'font/ttf', webm: 'audio/webm', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav' }[name.split('.').pop()] || 'application/octet-stream');
  const codec = {
    async ready() {
      const safe = electron.safeStorage;
      if (!(await safe.isAsyncEncryptionAvailable()) || (process.platform === 'linux' && safe.getSelectedStorageBackend() === 'basic_text')) throw new Error('Unlock or configure your system keychain to connect ChatGPT. Your offline library still works.');
      return safe;
    },
    async encrypt(value) { return (await this.ready()).encryptStringAsync(value); },
    async decrypt(value) { return (await (await this.ready()).decryptStringAsync(value)).result; }
  };
  async function state() { return { library: await store.read(auth.libraryKey()), auth: auth.status(), version: app.getVersion(), busy: !!job }; }
  async function exportLibrary() {
    const key = auth.libraryKey(), data = await store.read(key);
    const names = new Set(data.materials.flatMap(m => [m.coverAsset, ...(m.notes || []).map(n => n.audioAsset)]).filter(Boolean));
    const assets = {};
    for (const name of names) assets[name] = (await store.asset(key, name)).toString('base64');
    const target = await dialog.showSaveDialog(window, { title: 'Export your library', defaultPath: 'aftertaste-backup.json', filters: [{ name: 'Aftertaste backup', extensions: ['json'] }] });
    if (target.canceled) return { cancelled: true };
    await fs.writeFile(target.filePath, JSON.stringify({ application: 'aftertaste', version: 1, library: data, assets }, null, 2), { mode: 0o600 });
    return { saved: true };
  }
  async function restoreBackup(backup, key) {
    const data = backup.library;
    if (!data || !Array.isArray(data.materials) || !Array.isArray(data.sources) || data.materials.length > 20000 || data.sources.length > 5000) throw new Error('This backup is not supported.');
    const renamed = {};
    for (const [name, base64] of Object.entries(backup.assets || {})) {
      if (typeof base64 !== 'string') throw new Error('Invalid backup asset.');
      renamed[name] = await store.saveAsset(key, Buffer.from(base64, 'base64'), mime(name));
    }
    const materials = data.materials.map(m => ({ ...material(m), id: randomUUID(), coverAsset: renamed[m.coverAsset] || '', notes: (Array.isArray(m.notes) ? m.notes : []).slice(0, 5000).map(n => ({ id: randomUUID(), text: text(n.text, 50000), audioAsset: renamed[n.audioAsset] || '', createdAt: text(n.createdAt, 50) || new Date().toISOString() })).filter(n => n.text || n.audioAsset) }));
    const sources = data.sources.map(s => ({ id: randomUUID(), title: text(s.title, 200), body: text(s.body, 160000), kind: s.kind === 'chat' ? 'chat' : 'document', enabled: s.enabled !== false, importedAt: new Date().toISOString() })).filter(s => s.body);
    return store.update(key, target => { Object.assign(target, { materials, sources, recommendations: [], dismissed: [], contextSummary: '' }); });
  }
  const handlers = {
    state,
    search: p => search(p?.type || 'book', p?.query),
    saveStory: async p => {
      assertIdle(); const entry = material(p);
      return store.update(auth.libraryKey(), data => {
        const old = data.materials.find(m => m.id === entry.id);
        if (!old && data.materials.some(m => m.type === entry.type && m.title.toLowerCase() === entry.title.toLowerCase() && m.creator.toLowerCase() === entry.creator.toLowerCase())) throw new Error('This story is already in your library.');
        if (old) Object.assign(old, entry, { addedAt: old.addedAt }); else data.materials.unshift({ ...entry, notes: [] });
      });
    },
    deleteStory: async p => { assertIdle(); return store.update(auth.libraryKey(), data => { data.materials = data.materials.filter(m => m.id !== p?.id); }); },
    addNote: async p => {
      assertIdle(); const note = { id: randomUUID(), text: text(p?.text, 50000), audioAsset: '', createdAt: new Date().toISOString() };
      const key = auth.libraryKey(); const data = await store.read(key);
      if (!data.materials.some(m => m.id === p?.storyId)) throw new Error('Story not found.');
      if (p?.audio) note.audioAsset = await store.saveAsset(key, new Uint8Array(p.audio.bytes), p.audio.mime);
      if (!note.text && !note.audioAsset) throw new Error('Leave a thought or record a voice impression.');
      return store.update(key, d => d.materials.find(m => m.id === p.storyId).notes.unshift(note));
    },
    deleteNote: async p => { assertIdle(); return store.update(auth.libraryKey(), data => { const story = data.materials.find(m => m.id === p?.storyId); if (story) story.notes = story.notes.filter(n => n.id !== p?.id); }); },
    asset: async p => { assertIdle(); return { name: await store.saveAsset(auth.libraryKey(), new Uint8Array(p?.bytes), p?.mime) }; },
    importPreview: async () => {
      assertIdle();
      const choice = await dialog.showOpenDialog(window, { title: 'Choose context to import', properties: ['openFile'], filters: [{ name: 'Conversations, documents or Aftertaste backup', extensions: ['json', 'txt', 'md', 'markdown'] }] });
      imports = []; importedBackup = null;
      if (choice.canceled) return { cancelled: true };
      const file = choice.filePaths[0];
      if ((await fs.stat(file)).size > 100 * 1024 * 1024) throw new Error('Choose a text file smaller than 100 MB.');
      const contents = await fs.readFile(file, 'utf8');
      if (/\.json$/i.test(file)) {
        let parsed; try { parsed = JSON.parse(contents); } catch { throw new Error('This JSON file could not be read.'); }
        if (parsed.application === 'aftertaste' && parsed.version === 1) {
          importedBackup = parsed;
          return { backup: true, count: parsed.library?.materials?.length || 0 };
        }
      }
      imports = parseImport(path.basename(file), contents);
      return { items: imports.map(s => ({ id: s.id, title: s.title, preview: s.body.slice(0, 800), length: s.body.length })) };
    },
    importCommit: async p => {
      assertIdle();
      const key = auth.libraryKey();
      if (p?.restore === true && importedBackup) { const result = await restoreBackup(importedBackup, key); importedBackup = null; return result; }
      const selected = imports.filter(s => Array.isArray(p?.ids) && p.ids.includes(s.id));
      if (!selected.length) throw new Error('Select at least one conversation or document.');
      if (selected.length > 120) throw new Error('Import up to 120 sources at a time.');
      const result = await store.update(key, data => { for (const s of selected) if (!data.sources.some(x => x.id === s.id)) data.sources.push({ ...s, enabled: true }); });
      imports = []; return result;
    },
    removeSource: async p => { assertIdle(); return store.update(auth.libraryKey(), data => { data.sources = data.sources.filter(s => s.id !== p?.id); data.contextSummary = ''; data.recommendations = []; }); },
    toggleSource: async p => { assertIdle(); return store.update(auth.libraryKey(), data => { const s = data.sources.find(s => s.id === p?.id); if (s) s.enabled = !!p.enabled; data.contextSummary = ''; data.recommendations = []; }); },
    export: exportLibrary,
    connect: p => { assertIdle(); return auth.connect(p?.key || 'new'); },
    cancelSignIn: () => { auth.cancel(); return true; },
    selectAccount: p => { assertIdle(); imports = []; importedBackup = null; return auth.select(p?.key || 'local'); },
    disconnect: () => { if (job) job.abort(); return auth.disconnect(); },
    acknowledge: () => auth.acknowledge(),
    models: async () => models(await auth.access()),
    recommend: async p => {
      assertIdle(); const controller = new AbortController(); job = controller;
      try {
        const key = auth.libraryKey(); const data = await store.read(key); const accessToken = await auth.access(key);
        controller.signal.throwIfAborted();
        const available = await models(accessToken);
        const model = available.find(m => m.id === p?.model)?.id || available[0].id;
        const result = await recommend({ data, accessToken, model, query: p?.query, format: p?.format || 'book', signal: controller.signal, progress: message => notify({ progress: message }) });
        controller.signal.throwIfAborted();
        if (key !== auth.libraryKey() || fingerprint(await store.read(key)) !== result.fingerprint) throw new Error('Your context changed during selection. Please try again.');
        await store.update(key, d => { d.recommendations = result.picks; d.contextSummary = result.summary; d.recommendationIntro = result.intro; d.generatedAt = result.generatedAt; });
        return result;
      } finally { job = null; notify(); }
    },
    cancelRecommendation: () => { job?.abort(); return true; },
    dismiss: async p => { assertIdle(); return store.update(auth.libraryKey(), data => { const r = data.recommendations.find(r => r.externalId === p?.id); if (r) data.dismissed.push(r.title); data.recommendations = data.recommendations.filter(r => r.externalId !== p?.id); }); },
    openExternal: async p => { const url = httpsURL(p?.url); if (!url) throw new Error('Choose a valid HTTPS link.'); await shell.openExternal(url); return true; },
    openDataFolder: async () => { await fs.mkdir(store.folder(auth.libraryKey()), { recursive: true, mode: 0o700 }); await shell.openPath(store.folder(auth.libraryKey())); return true; }
  };
  app.on('second-instance', () => { if (window) { window.show(); window.focus(); } });
  app.on('before-quit', () => { job?.abort(); auth?.cancel(); });
  app.whenReady().then(async () => {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    store = new LibraryStore(root);
    auth = new AuthManager({ root, codec, openBrowser: url => shell.openExternal(url), changed: () => notify() });
    try { await auth.init(); } catch (e) { dialog.showErrorBox('ChatGPT connection needs attention', e.message); }
    protocol.handle('aftertaste', async request => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== 'app' || request.method !== 'GET') return new Response('Not found', { status: 404 });
        const pathname = decodeURIComponent(url.pathname);
        if (pathname.startsWith('/local-assets/')) {
          const name = pathname.slice('/local-assets/'.length);
          return new Response(await store.asset(auth.libraryKey(), name), { headers: { 'Content-Type': mime(name), 'Cache-Control': 'no-store' } });
        }
        const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
        const target = path.resolve(renderer, relative);
        if (!target.startsWith(`${renderer}${path.sep}`) || !/\.(html|css|js|webp|ttf|svg)$/.test(target)) return new Response('Not found', { status: 404 });
        return new Response(await fs.readFile(target), { headers: { 'Content-Type': mime(target), 'Cache-Control': 'no-store' } });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    window = new BrowserWindow({ width: 1320, height: 900, minWidth: 840, minHeight: 650, title: 'Aftertaste', icon: path.join(renderer, 'assets', 'icon.png'), backgroundColor: '#0a1010', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: true } });
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(wc === window.webContents && wc.getURL() === APP_URL && permission === 'media' && details.mediaTypes?.every(t => t === 'audio')));
    session.defaultSession.setPermissionCheckHandler((wc, permission, origin, details) => wc === window.webContents && wc.getURL() === APP_URL && permission === 'media' && details.mediaType === 'audio');
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (url !== APP_URL) event.preventDefault(); });
    ipcMain.handle('aftertaste:action', async (event, action, payload) => {
      if (!trusted(event.senderFrame) || !Object.hasOwn(handlers, action)) return { ok: false, error: 'This action is unavailable.' };
      try { return { ok: true, data: await handlers[action](payload) }; }
      catch (e) { return { ok: false, error: e.name === 'AbortError' ? 'Selection cancelled. Your previous recommendations are still saved.' : e.code ? 'This local action could not be completed. Check file permissions and try again.' : e.message || 'This action could not be completed.' }; }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ label: 'Aftertaste', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }] }] : []),
      { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
    ]));
    await window.loadURL(APP_URL);
    window.on('closed', () => { window = null; app.quit(); });
  }).catch(() => { dialog.showErrorBox('Aftertaste could not start', 'Please restart the app. Your library has not been deleted.'); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
