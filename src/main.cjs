const electron = require('electron');
const { app, BrowserWindow, ipcMain, protocol, session, shell, dialog, Menu, net } = electron;
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { LibraryStore, atomicWrite, readJSON } = require('./storage.cjs');
const { prepareUpdateBackup, snapshotLibraries, portableBackup, copyOfflineLibrary } = require('./backups.cjs');
const { material, text, httpsURL, fingerprint } = require('./validation.cjs');
const { parseImport } = require('./import.cjs');
const { AuthManager } = require('./auth.cjs');
const { search } = require('./catalog.cjs');
const { models, recommend } = require('./inference.cjs');
const { ChatBridge } = require('./chat-bridge.cjs');

app.setName('Aftertaste');
if (!app.isPackaged && process.env.AFTERTASTE_TEST_DATA_DIR) app.setPath('userData', path.resolve(process.env.AFTERTASTE_TEST_DATA_DIR));
protocol.registerSchemesAsPrivileged([{ scheme: 'aftertaste', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); } else {
  let window, auth, store, bridge, job, preferences = { language: 'en' }, messages = {}, imports = [], importedBackup = null;
  const root = path.join(app.getPath('userData'), 'private');
  const renderer = path.join(__dirname, '..', 'renderer');
  const t = key => messages[key] || key;
  async function language(value) {
    preferences.language = ['en', 'ru', 'fr'].includes(value) ? value : 'en';
    messages = JSON.parse(await fs.readFile(path.join(renderer, 'locales', `${preferences.language}.json`), 'utf8'));
  }
  const APP_URL = 'aftertaste://app/index.html';
  const notify = payload => { if (window && !window.isDestroyed()) window.webContents.send('aftertaste:update', payload || {}); };
  const trusted = frame => frame && frame.url === APP_URL && frame === window?.webContents.mainFrame;
  const assertIdle = () => { if (job) throw new Error('Wait for the selection to finish or cancel it first.'); };
  const mime = name => ({ html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', json: 'application/json; charset=utf-8', svg: 'image/svg+xml', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', ttf: 'font/ttf', webm: 'audio/webm', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav' }[name.split('.').pop()] || 'application/octet-stream');
  const codec = {
    async ready() {
      const safe = electron.safeStorage;
      if (!(await safe.isAsyncEncryptionAvailable()) || (process.platform === 'linux' && safe.getSelectedStorageBackend() === 'basic_text')) throw new Error('Unlock or configure your system keychain to connect ChatGPT. Your offline library still works.');
      return safe;
    },
    async encrypt(value) { return (await this.ready()).encryptStringAsync(value); },
    async decrypt(value) { return (await (await this.ready()).decryptStringAsync(value)).result; }
  };
  async function state() { return { library: await store.read(auth.libraryKey()), auth: auth.status(), preferences, latestBackup: await readJSON(path.join(root, 'latest-backup.json'), null), version: app.getVersion(), busy: !!job, chatBridge: bridge?.info() || { enabled: false } }; }
  async function exportLibrary(contextOnly = false) {
    const key = auth.libraryKey();
    const backup = contextOnly ? { application: 'aftertaste-context', version: 1, sources: (await store.read(key)).sources } : await portableBackup(store, key);
    const target = await dialog.showSaveDialog(window, { title: t(contextOnly ? 'context.export' : 'backup.download'), defaultPath: contextOnly ? 'aftertaste-context.json' : `aftertaste-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (target.canceled) return { cancelled: true };
    await atomicWrite(target.filePath, JSON.stringify(backup, null, 2));
    return { saved: true };
  }
  async function restoreBackup(backup, key) {
    const data = backup.library;
    if (!data || !Array.isArray(data.materials) || !Array.isArray(data.sources) || data.materials.length > 20000 || data.sources.length > 5000) throw new Error('This backup is not supported.');
    await snapshotLibraries(root, { version: app.getVersion(), reason: 'before-restore', keys: [key] });
    const renamed = {};
    for (const [name, base64] of Object.entries(backup.assets || {})) {
      if (typeof base64 !== 'string') throw new Error('Invalid backup asset.');
      renamed[name] = await store.saveAsset(key, Buffer.from(base64, 'base64'), mime(name));
    }
    const materials = data.materials.map(m => ({ ...material(m), id: randomUUID(), coverAsset: renamed[m.coverAsset] || '', notes: (Array.isArray(m.notes) ? m.notes : []).slice(0, 5000).map(n => ({ id: randomUUID(), text: text(n.text, 50000), audioAsset: renamed[n.audioAsset] || '', createdAt: text(n.createdAt, 50) || new Date().toISOString() })).filter(n => n.text || n.audioAsset) }));
    const sources = data.sources.map(s => ({ id: randomUUID(), title: text(s.title, 200), body: text(s.body, 160000), chatBridgeKey: /^[a-zA-Z0-9_-]{1,100}$/.test(s.chatBridgeKey || '') ? s.chatBridgeKey : undefined, kind: s.kind === 'chat' ? 'chat' : 'document', enabled: s.enabled !== false, importedAt: new Date().toISOString() })).filter(s => s.body);
    return store.update(key, target => { Object.assign(target, { materials, sources, recommendations: [], dismissed: [], contextSummary: '', recommendationIntro: '', generatedAt: null, recommendationsStale: false, chatBridgeUpdates: [], chatBridgeLastUpdate: null }); });
  }
  const handlers = {
    state,
    preferences: async p => { await language(p?.language); await atomicWrite(path.join(root, 'preferences.json'), JSON.stringify(preferences)); notify(); return preferences; },
    exportContext: () => exportLibrary(true),
    openBackups: async () => { const folder = path.join(root, 'backups'); await fs.mkdir(folder, { recursive: true, mode: 0o700 }); await shell.openPath(folder); return true; },
    search: p => search(p?.type || 'book', p?.query, fetch, preferences.language),
    saveStory: async p => {
      assertIdle(); const entry = material(p);
      return store.update(auth.libraryKey(), data => {
        const old = data.materials.find(m => m.id === entry.id);
        if (!old && data.materials.some(m => m.type === entry.type && m.title.toLowerCase() === entry.title.toLowerCase() && m.creator.toLowerCase() === entry.creator.toLowerCase())) throw new Error('This story is already in your library.');
        if (old) Object.assign(old, entry, { addedAt: old.addedAt }); else data.materials.unshift({ ...entry, notes: [] });
      });
    },
    deleteStory: async p => { assertIdle(); const key = auth.libraryKey(); await snapshotLibraries(root, { version: app.getVersion(), reason: 'before-delete', keys: [key] }); return store.update(key, data => { data.materials = data.materials.filter(m => m.id !== p?.id); }); },
    addNote: async p => {
      assertIdle(); const note = { id: randomUUID(), text: text(p?.text, 50000), audioAsset: '', createdAt: new Date().toISOString() };
      const key = auth.libraryKey(); const data = await store.read(key);
      if (!data.materials.some(m => m.id === p?.storyId)) throw new Error('Story not found.');
      if (p?.audio) note.audioAsset = await store.saveAsset(key, new Uint8Array(p.audio.bytes), p.audio.mime);
      if (!note.text && !note.audioAsset) throw new Error('Leave a thought or record a voice impression.');
      return store.update(key, d => d.materials.find(m => m.id === p.storyId).notes.unshift(note));
    },
    deleteNote: async p => { assertIdle(); const key = auth.libraryKey(); await snapshotLibraries(root, { version: app.getVersion(), reason: 'before-delete', keys: [key] }); return store.update(key, data => { const story = data.materials.find(m => m.id === p?.storyId); if (story) story.notes = story.notes.filter(n => n.id !== p?.id); }); },
    asset: async p => { assertIdle(); return { name: await store.saveAsset(auth.libraryKey(), new Uint8Array(p?.bytes), p?.mime) }; },
    importPreview: async p => {
      assertIdle();
      const choice = await dialog.showOpenDialog(window, { title: t(p?.restore ? 'backup.restore' : 'context.import'), properties: ['openFile'], filters: [{ name: 'JSON / Text / Markdown', extensions: p?.restore ? ['json'] : ['json', 'txt', 'md', 'markdown'] }] });
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
        if (p?.restore && Array.isArray(parsed.materials) && Array.isArray(parsed.sources)) {
          const assets = {};
          const names = new Set(parsed.materials.flatMap(m => [m.coverAsset, ...(m.notes || []).map(n => n.audioAsset)]).filter(Boolean));
          for (const name of names) {
            if (!/^[a-f0-9-]{36}\.(png|jpg|webp|webm|ogg|mp3|m4a|wav)$/.test(name)) throw new Error('Invalid backup asset.');
            const asset = path.join(path.dirname(file), 'assets', name);
            const info = await fs.lstat(asset); if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error('Invalid backup asset.');
            assets[name] = (await fs.readFile(asset)).toString('base64');
          }
          importedBackup = { application: 'aftertaste', version: 1, library: parsed, assets };
          return { backup: true, count: parsed.materials.length };
        }
        if (p?.restore) throw new Error('This backup is not supported.');
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
    export: () => exportLibrary(false),
    connect: async p => {
      assertIdle();
      const firstConnection = auth.libraryKey() === 'local' && auth.status().accounts.length === 0;
      const result = await auth.connect(p?.key || 'new');
      if (firstConnection && auth.libraryKey() !== 'local') await copyOfflineLibrary(store, auth.libraryKey());
      notify(); return result;
    },
    cancelSignIn: () => { auth.cancel(); return true; },
    selectAccount: p => { assertIdle(); imports = []; importedBackup = null; return auth.select(p?.key || 'local'); },
    disconnect: () => { if (job) job.abort(); return auth.disconnect(); },
    acknowledge: () => auth.acknowledge(),
    models: async () => models(await auth.access()),
    setChatBridge: p => { if (p?.enabled === true) assertIdle(); return bridge.setEnabled(p?.enabled === true); },
    recommend: async p => {
      assertIdle();
      const key = auth.libraryKey();
      if (p?.accountKey && p.accountKey !== key) throw new Error('Open the paired shelf before starting a selection.');
      const controller = new AbortController(); job = controller; notify({ selectionStarted: true });
      try {
        const data = await store.read(key);
        if (p?.expectedRevision && fingerprint(data) !== p.expectedRevision) throw new Error('Your context changed. Read status before starting a selection.');
        const accessToken = await auth.access(key);
        controller.signal.throwIfAborted();
        const available = await models(accessToken);
        const model = available.find(m => m.id === p?.model)?.id || available[0].id;
        const result = await recommend({ data, accessToken, model, language: preferences.language, query: p?.query, format: p?.format || 'book', signal: controller.signal, progress: message => notify({ progress: message }) });
        controller.signal.throwIfAborted();
        if (key !== auth.libraryKey() || fingerprint(await store.read(key)) !== result.fingerprint) throw new Error('Your context changed during selection. Please try again.');
        await store.update(key, d => {
          if (key !== auth.libraryKey() || fingerprint(d) !== result.fingerprint) throw new Error('Your context changed during selection. Please try again.');
          d.recommendations = result.picks; d.contextSummary = result.summary; d.recommendationIntro = result.intro; d.generatedAt = result.generatedAt; d.recommendationsStale = false;
        });
        return result;
      } catch (e) { notify({ selectionError: e.name === 'AbortError' ? 'Selection cancelled. Your previous recommendations are still saved.' : e.code ? 'The selection could not finish.' : e.message }); throw e;
      } finally { job = null; notify(); }
    },
    cancelRecommendation: () => { job?.abort(); return true; },
    dismiss: async p => { assertIdle(); return store.update(auth.libraryKey(), data => { const r = data.recommendations.find(r => r.externalId === p?.id); if (r) data.dismissed.push(r.title); data.recommendations = data.recommendations.filter(r => r.externalId !== p?.id); }); },
    openExternal: async p => { const url = httpsURL(p?.url); if (!url) throw new Error('Choose a valid HTTPS link.'); await shell.openExternal(url); return true; },
    openDataFolder: async () => { await fs.mkdir(store.folder(auth.libraryKey()), { recursive: true, mode: 0o700 }); await shell.openPath(store.folder(auth.libraryKey())); return true; }
  };
  app.on('second-instance', () => { if (window) { window.show(); window.focus(); } });
  app.on('before-quit', () => { job?.abort(); auth?.cancel(); bridge?.close().catch(() => {}); });
  app.whenReady().then(async () => {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    preferences = await readJSON(path.join(root, 'preferences.json'), { language: 'en' });
    await language(preferences.language);
    await prepareUpdateBackup(root, app.getVersion());
    store = new LibraryStore(root);
    auth = new AuthManager({ root, codec, openBrowser: url => shell.openExternal(url), changed: () => notify() });
    try { await auth.init(); } catch (e) { dialog.showErrorBox('ChatGPT connection needs attention', e.message); }
    bridge = new ChatBridge({ root, store, activeKey: () => auth.libraryKey(), assertIdle, runRecommendation: p => handlers.recommend(p), cancel: () => job?.abort(), changed: notify, version: app.getVersion() });
    try { await bridge.init(); } catch { dialog.showErrorBox('Local chat connection needs attention', 'Your library is safe. Disable and enable Updates from your chat in Settings to reconnect.'); }
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
        if (!target.startsWith(`${renderer}${path.sep}`) || !/\.(html|css|js|json|webp|ttf|svg)$/.test(target)) return new Response('Not found', { status: 404 });
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
